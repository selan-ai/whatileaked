import { aggregate, type LeakSite, type RuleTotal } from '#report/aggregate'
import { DISCLOSURE } from '#report/disclosure'
import type { Finding, ScanStats } from '#report/finding'
import { plural, shorten } from '#report/paths'
import { bold, dim, green, red, yellow } from '#report/style'
import { FileKind } from '#sources/source'

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
    const sent = distinct(totals, FileKind.transcript)
    const onDisk = distinct(totals, FileKind.memory)

    // No title here: `main` has already drawn the banner, and two headings
    // read as a bug.
    this.#write(
      dim(
        `  scanned ${count(stats.transcripts)} transcripts · ` +
          `${count(stats.entries)} messages · ${count(stats.memoryFiles)} memory files`,
      ),
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

    this.#write(bold(red(`${plural(sent, 'credential')} sent to a model provider.`)))

    if (onDisk > 0) {
      // Deliberately not folded into the count above. A global instruction file
      // is sent every session, but a project memory file surfaces on relevance,
      // so "sent" is not provable for all of them — and this tool's whole
      // discipline is making only the claim it can defend.
      this.#write(
        bold(red(`${plural(onDisk, 'credential')} still on disk, in files your agent reads.`)),
      )
      this.#write(
        red('Remove them there as well as rotating, or the next session sends them again.'),
      )
    }

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

/** Summed per rule rather than across all of them, matching what this reported
 *  before memory files existed: one fingerprint matched by two rules is two
 *  findings to act on. */
function distinct(totals: readonly RuleTotal[], kind: FileKind): number {
  return totals.reduce((sum, total) => sum + kindDistinct(total.sites, kind), 0)
}

function kindDistinct(sites: readonly LeakSite[], kind: FileKind): number {
  const matching = sites.filter((site) => site.kind === kind)
  return new Set(matching.map((site) => site.fingerprint)).size
}
