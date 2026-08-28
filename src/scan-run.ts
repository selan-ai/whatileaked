import { readLines } from '#memory/reader'
import type { Finding, ScanStats } from '#report/finding'
import type { Progress } from '#report/progress'
import type { TerminalReporter } from '#report/terminal-reporter'
import type { Match } from '#scan/match'
import type { Scanner } from '#scan/scanner'
import { FileKind, type ScanFile, type Source } from '#sources/source'
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
    const stats: ScanStats = {
      transcripts: 0,
      memoryFiles: 0,
      entries: 0,
      skipped: 0,
      unscannable: 0,
    }

    for (const source of this.#sources) {
      for await (const file of source.discover()) {
        if (file.kind === FileKind.transcript) {
          stats.transcripts++
          const reader = new TranscriptReader()

          for await (const entry of reader.read(file.path)) {
            this.#collect(file, entry.line, entry.index, findings, stats)
          }

          stats.entries += reader.stats.entries
          stats.skipped += reader.stats.skipped
        } else {
          stats.memoryFiles++

          for await (const line of readLines(file.path)) {
            this.#collect(file, line.text, line.number, findings, stats)
          }
        }

        // After the read rather than before it: the number now counts files
        // finished, which is what it means once two kinds are mixed.
        this.#progress.advance(stats.transcripts + stats.memoryFiles, file.project)
      }
    }

    this.#progress.done()
    this.#reporter.report(findings, stats)
    return findings.length
  }

  /** One entry the engine chokes on must not cost the other 700,000. */
  #collect(file: ScanFile, text: string, at: number, findings: Finding[], stats: ScanStats): void {
    let matches: readonly Match[] = []
    try {
      matches = this.#scanner.scan(text)
    } catch {
      stats.unscannable++
      return
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
        at,
      })
    }
  }
}
