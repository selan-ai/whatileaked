import type { Finding, ScanStats } from '#report/finding'
import type { Progress } from '#report/progress'
import type { TerminalReporter } from '#report/terminal-reporter'
import type { Match } from '#scan/match'
import type { Scanner } from '#scan/scanner'
import type { Source } from '#sources/source'
import { TranscriptReader } from '#transcript/reader'

export class ScanRun {
  readonly #sources: readonly Source[]
  readonly #scanner: Scanner
  readonly #reporter: TerminalReporter
  readonly #progress: Progress

  constructor(
    sources: readonly Source[],
    scanner: Scanner,
    reporter: TerminalReporter,
    progress: Progress,
  ) {
    this.#sources = sources
    this.#scanner = scanner
    this.#reporter = reporter
    this.#progress = progress
  }

  /** Returns the finding count so the CLI can pick an exit code without
   *  re-deriving it from the reporter's output. */
  async run(): Promise<number> {
    const findings: Finding[] = []
    const stats: ScanStats = { transcripts: 0, entries: 0, skipped: 0, unscannable: 0 }

    for (const source of this.#sources) {
      for await (const file of source.discover()) {
        stats.transcripts++
        this.#progress.advance(stats.transcripts, file.project)
        const reader = new TranscriptReader()

        for await (const entry of reader.read(file.path)) {
          // One entry the engine chokes on must not cost the other 700,000.
          let matches: readonly Match[] = []
          try {
            matches = this.#scanner.scan(entry.line)
          } catch {
            stats.unscannable++
            continue
          }

          for (const match of matches) {
            findings.push({
              rule: match.rule,
              fingerprint: match.fingerprint,
              context: match.context,
              source: file.source,
              kind: file.kind,
              project: file.project,
              file: file.path,
              at: entry.index,
            })
          }
        }

        stats.entries += reader.stats.entries
        stats.skipped += reader.stats.skipped
      }
    }

    this.#progress.done()
    this.#reporter.report(findings, stats)
    return findings.length
  }
}
