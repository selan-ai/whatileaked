import { readFile, rename, writeFile } from 'node:fs/promises'
import { plural, shorten } from '#report/paths'
import { bold, dim, red, yellow } from '#report/style'
import type { Scanner } from '#scan/scanner'
import type { Source } from '#sources/source'
import { TranscriptReader } from '#transcript/reader'
import { CONFIRMATION, type Prompt } from '#wipe/confirm'
import { redactLine } from '#wipe/redact'

export interface WipePlan {
  file: string
  project: string
  /** Line indices to rewrite, and how many secrets each holds. */
  lines: number
  secrets: number
}

export interface WipeOutcome {
  planned: readonly WipePlan[]
  filesRewritten: number
  secretsRedacted: number
  confirmed: boolean
}

/**
 * Replaces secrets in local transcripts with a placeholder.
 *
 * Separate from scanning, and never reachable from the default command,
 * because it is the only thing here that destroys anything. It also does not
 * undo the leak: the credential reached a model provider before this ran, and
 * the only fix for that is rotation. The reporter says so.
 */
export class WipeRun {
  readonly #sources: readonly Source[]
  readonly #scanner: Scanner
  readonly #prompt: Prompt
  readonly #write: (line: string) => void

  constructor(
    sources: readonly Source[],
    scanner: Scanner,
    prompt: Prompt,
    write: (line: string) => void,
  ) {
    this.#sources = sources
    this.#scanner = scanner
    this.#prompt = prompt
    this.#write = write
  }

  async run(): Promise<WipeOutcome> {
    const plans = await this.#plan()
    if (plans.length === 0) {
      return { planned: [], filesRewritten: 0, secretsRedacted: 0, confirmed: false }
    }

    this.#preview(plans)

    const answer = await this.#prompt.ask(
      `  Type ${bold(red(CONFIRMATION))} to rewrite these files, or anything else to stop: `,
    )
    if (answer !== CONFIRMATION) {
      return { planned: plans, filesRewritten: 0, secretsRedacted: 0, confirmed: false }
    }

    let filesRewritten = 0
    let secretsRedacted = 0
    for (const plan of plans) {
      secretsRedacted += await this.#rewrite(plan.file)
      filesRewritten++
    }

    return { planned: plans, filesRewritten, secretsRedacted, confirmed: true }
  }

  async #plan(): Promise<readonly WipePlan[]> {
    const plans: WipePlan[] = []

    for (const source of this.#sources) {
      for await (const file of source.discover()) {
        const reader = new TranscriptReader()
        let lines = 0
        let secrets = 0

        for await (const entry of reader.read(file.path)) {
          const found = this.#scanner.secretsOf(entry.line)
          if (found.size === 0) continue
          lines++
          secrets += found.size
        }

        if (lines > 0) plans.push({ file: file.path, project: file.project, lines, secrets })
      }
    }

    return plans
  }

  /** Rewrites through a temporary file and a rename, so an interrupted run
   *  leaves the original intact rather than half a transcript. */
  async #rewrite(file: string): Promise<number> {
    const original = await readFile(file, 'utf8')
    const lines = original.split('\n')

    let redacted = 0
    const rewritten = lines.map((line) => {
      if (line.trim().length === 0) return line

      const secrets = this.#scanner.secretsOf(line)
      if (secrets.size === 0) return line

      redacted += secrets.size
      return redactLine(line, secrets)
    })

    const temporary = `${file}.whatileaked-tmp`
    await writeFile(temporary, rewritten.join('\n'), 'utf8')
    await rename(temporary, file)

    return redacted
  }

  #preview(plans: readonly WipePlan[]): void {
    const secrets = plans.reduce((sum, plan) => sum + plan.secrets, 0)
    const project = Math.max(...plans.map((plan) => plan.project.length))

    this.#write(dim(`  ${plural(secrets, 'secret')} across ${plural(plans.length, 'file')}`))
    this.#write('')

    for (const plan of plans) {
      this.#write(
        `  ${yellow('*')} ${bold(plan.project.padEnd(project))}  ` +
          `${dim(`${plural(plan.secrets, 'secret')} in ${plural(plan.lines, 'message')}`)}`,
      )
      this.#write(`      ${dim(shorten(plan.file))}`)
    }

    this.#write('')
    this.#write(bold(red(`  Every secret above will be replaced with a placeholder.`)))
    this.#write(red('  This rewrites the files and cannot be undone.'))
    this.#write('')
    this.#write(dim('  It does not un-send anything — all of these already reached a model'))
    this.#write(dim('  provider. Rotate them whether or not you wipe.'))
    this.#write('')
  }
}
