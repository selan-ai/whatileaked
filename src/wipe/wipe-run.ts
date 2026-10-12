import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { readLines } from '#memory/reader'
import { plural, shorten } from '#report/paths'
import { bold, dim, red, yellow } from '#report/style'
import type { Scanner } from '#scan/scanner'
import { isJsonl } from '#sources/listing'
import { FileKind, type ScanFile, type Source } from '#sources/source'
import { TranscriptReader } from '#transcript/reader'
import { CONFIRMATION, type Prompt } from '#wipe/confirm'
import { redactLine } from '#wipe/redact'

export interface WipePlan {
  file: string
  project: string
  kind: FileKind
  /** Line indices to rewrite, and how many secrets each holds. */
  lines: number
  secrets: number
}

export interface WipeOutcome {
  planned: readonly WipePlan[]
  /** Databases that hold a secret, or could not be read to find out. `wipe`
   *  rewrites lines of text and leaves these exactly as they are. */
  untouched: readonly string[]
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
    const { plans, untouched } = await this.#plan()
    if (plans.length === 0) {
      return { planned: [], untouched, filesRewritten: 0, secretsRedacted: 0, confirmed: false }
    }

    this.#preview(plans)

    const answer = await this.#prompt.ask(
      `  Type ${bold(red(CONFIRMATION))} to rewrite these files, or anything else to stop: `,
    )
    if (answer !== CONFIRMATION) {
      return { planned: plans, untouched, filesRewritten: 0, secretsRedacted: 0, confirmed: false }
    }

    let filesRewritten = 0
    let secretsRedacted = 0
    for (const plan of plans) {
      secretsRedacted += await this.#rewrite(plan.file)
      filesRewritten++
    }

    return { planned: plans, untouched, filesRewritten, secretsRedacted, confirmed: true }
  }

  async #plan(): Promise<{ plans: readonly WipePlan[]; untouched: readonly string[] }> {
    const plans: WipePlan[] = []
    const untouched: string[] = []

    for (const source of this.#sources) {
      for await (const file of source.discover()) {
        if (file.messages !== undefined) {
          if (!(await this.#holdsSecret(file.messages))) continue
          untouched.push(file.path)
          continue
        }

        let lines = 0
        let secrets = 0

        for await (const text of this.#textOf(file)) {
          const found = this.#scanner.secretsOf(text)
          if (found.size === 0) continue
          lines++
          secrets += found.size
        }

        if (lines > 0) {
          plans.push({ file: file.path, project: file.project, kind: file.kind, lines, secrets })
        }
      }
    }

    return { plans, untouched }
  }

  /** True for a database that cannot be read: it may hold one, and saying
   *  nothing about it would let a wipe pass for complete. */
  async #holdsSecret(messages: ScanFile['messages']): Promise<boolean> {
    if (messages == null) return true
    try {
      for await (const message of messages()) {
        if (this.#scanner.secretsOf(message.text).size > 0) return true
      }
      return false
    } catch {
      return true
    }
  }

  /** The rewrite below is textual and kind-blind; only counting needs to know
   *  which reader gets the file. */
  async *#textOf(file: ScanFile): AsyncIterable<string> {
    if (!isJsonl(file.path)) {
      for await (const line of readLines(file.path)) yield line.text
      return
    }

    const reader = new TranscriptReader()
    for await (const entry of reader.read(file.path)) yield entry.line
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

    // The mode travels with the content. An instruction file is likelier than a
    // transcript to have been deliberately locked down, and a rewrite that
    // quietly widened 0600 to 0644 would be a second leak.
    const { mode } = await stat(file)
    const temporary = `${file}.whatileaked-tmp`
    await writeFile(temporary, rewritten.join('\n'), { encoding: 'utf8', mode })
    await rename(temporary, file)

    return redacted
  }

  #preview(plans: readonly WipePlan[]): void {
    const secrets = plans.reduce((sum, plan) => sum + plan.secrets, 0)
    const project = Math.max(...plans.map((plan) => plan.project.length))

    this.#write(dim(`  ${plural(secrets, 'secret')} across ${plural(plans.length, 'file')}`))
    this.#write('')

    for (const plan of plans) {
      // A transcript is counted in messages; a memory file has no messages, so
      // the honest unit there is the line the reader will rewrite.
      const unit = plan.kind === FileKind.memory ? 'line' : 'message'
      this.#write(
        `  ${yellow('*')} ${bold(plan.project.padEnd(project))}  ` +
          `${dim(`${plural(plan.secrets, 'secret')} in ${plural(plan.lines, unit)}`)}`,
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
