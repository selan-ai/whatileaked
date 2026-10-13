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
      if (this.#notScanned(stats)) this.#write('')
      this.#write(dim(DISCLOSURE))
      this.#share(sent, stats)
      return
    }

    for (const total of totals) {
      this.#write(`${red('*')} ${bold(total.rule)}  ${dim(plural(total.distinct, 'secret'))}`)

      for (const site of total.sites) {
        const times = occurrences(site)
        this.#write(
          `    ${yellow(site.fingerprint.slice(0, FINGERPRINT_CHARS))}  ` +
            `${site.project.padEnd(PROJECT_COLUMN)} ${dim(times)}`,
        )
        if (site.context !== '') this.#write(`              ${dim(`${site.context}***`)}`)
        this.#write(`              ${dim(where(site))}`)
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

    this.#notScanned(stats)

    this.#write('')
    this.#write(dim('The 8-character code is a fingerprint, never the secret: a truncated'))
    this.#write(dim('SHA-256, so one credential shows the same code everywhere it leaked.'))
    this.#write(dim('Some findings will be test fixtures — open the file to tell.'))
    this.#write('')
    this.#write(dim(DISCLOSURE))
    this.#share(sent, stats)
  }

  /**
   * Everything that was found and not looked at: refused messages, then one
   * plain line per file not read. Printed under a clean result too, which is
   * exactly where leaving it out would mislead — a clean scan once returned
   * before the refused count, so a partial scan read as a clean one. Answers
   * whether it wrote anything.
   */
  #notScanned(stats: ScanStats): boolean {
    if (stats.unscannable > 0) {
      this.#write(
        yellow(`${plural(stats.unscannable, 'message')} could not be scanned and are not counted.`),
      )
    }
    for (const file of stats.unread) {
      this.#write(yellow(`Found ${shorten(file.path)} but did not scan it: ${file.reason}.`))
    }
    return stats.unscannable > 0 || stats.unread.length > 0
  }

  /**
   * The one line meant to be pasted somewhere public. Everything above it names
   * projects, paths and fingerprints, so nobody shares it; this is counts only,
   * and stays that way. It is last so a screenshot can crop to it, unstyled so
   * a copy carries nothing but the words, and it repeats the headline's
   * transmitted-only count for the same reason the headline keeps memory files
   * out of it.
   */
  #share(sent: number, stats: ScanStats): void {
    const credentials = sent === 0 ? 'no credentials' : plural(sent, 'credential')
    this.#write('')
    this.#write(
      `whatileaked: ${credentials} sent to a model provider, ` +
        `across ${plural(stats.transcripts, 'transcript')}.`,
    )
  }
}

function count(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * How often the secret turned up, phrased for the kind of file it sits in.
 *
 * A transcript occurrence is a message that went to a provider, so "sent" is
 * exactly right. A memory-file occurrence is a line still on disk, and calling
 * that "sent" would assert the transmission the summary below deliberately
 * declines to claim — printed, as it would be, two lines above a headline
 * counting zero credentials sent.
 */
function occurrences(site: LeakSite): string {
  if (site.kind === FileKind.memory) {
    return site.occurrences === 1 ? 'on one line' : `on ${count(site.occurrences)} lines`
  }

  return site.occurrences === 1 ? 'sent once' : `sent ${count(site.occurrences)} times`
}

/**
 * Where to go and fix it.
 *
 * A memory file gets `path:line`, because that is a place a person can open and
 * edit — which is the whole repair for a file still on disk. A transcript gets
 * the path alone: its position is a message index into one long jsonl line, and
 * printing a number nobody can navigate to would be noise.
 */
function where(site: LeakSite): string {
  const path = shorten(site.file)
  return site.kind === FileKind.memory ? `${path}:${site.firstAt}` : path
}

/** Summed per rule rather than across all of them, matching what this reported
 *  before memory files existed: one fingerprint matched by two rules is two
 *  findings to act on. */
function distinct(totals: readonly RuleTotal[], kind: FileKind): number {
  return totals.reduce((sum, total) => {
    const matching = total.sites.filter((site) => site.kind === kind)
    return sum + new Set(matching.map((site) => site.fingerprint)).size
  }, 0)
}
