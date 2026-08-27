import { aggregate } from '#report/aggregate'
import { DISCLOSURE } from '#report/disclosure'
import type { Finding, ScanStats } from '#report/finding'
import { plural, shorten } from '#report/paths'
import { bold, dim, green, red, yellow } from '#report/style'

const PROJECT_COLUMN = 22
const FINGERPRINT_CHARS = 8

/** The write function is injected so a test reads lines instead of a stream. */
export class TerminalReporter {
  readonly #write: (line: string) => void

  constructor(write: (line: string) => void) {
    this.#write = write
  }

  report(findings: readonly Finding[], stats: ScanStats): void {
    const totals = aggregate(findings)
    const secrets = totals.reduce((sum, total) => sum + total.distinct, 0)

    // No title here: `main` has already drawn the banner, and two headings
    // read as a bug.
    this.#write(
      dim(`  scanned ${count(stats.transcripts)} transcripts · ${count(stats.entries)} messages`),
    )
    this.#write('')

    if (totals.length === 0) {
      this.#write(green('No credentials found.'))
      this.#write('')
      this.#write(dim(DISCLOSURE))
      return
    }

    for (const total of totals) {
      this.#write(`${red('*')} ${bold(total.rule)}  ${dim(plural(total.distinct, 'secret'))}`)

      for (const site of total.sites) {
        const times = site.occurrences === 1 ? 'sent once' : `sent ${count(site.occurrences)} times`
        this.#write(
          `    ${yellow(site.fingerprint.slice(0, FINGERPRINT_CHARS))}  ` +
            `${site.project.padEnd(PROJECT_COLUMN)} ${dim(times)}`,
        )
        if (site.context !== '') this.#write(`              ${dim(`${site.context}***`)}`)
        this.#write(`              ${dim(shorten(site.file))}`)
      }

      this.#write('')
    }

    this.#write(bold(red(`${plural(secrets, 'credential')} sent to a model provider.`)))

    if (stats.unscannable > 0) {
      this.#write(
        yellow(`${plural(stats.unscannable, 'message')} could not be scanned and are not counted.`),
      )
    }

    this.#write('')
    this.#write(dim('The 8-character code is a fingerprint, never the secret: a truncated'))
    this.#write(dim('SHA-256, so one credential shows the same code everywhere it leaked.'))
    this.#write(dim('Some findings will be test fixtures — open the file to tell.'))
    this.#write('')
    this.#write(dim(DISCLOSURE))
  }
}

function count(value: number): string {
  return value.toLocaleString('en-US')
}
