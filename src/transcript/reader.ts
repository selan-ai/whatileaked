import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { ReadStats, TranscriptEntry } from '#transcript/entry'

/**
 * Line-by-line rather than `readFile`: a long session is tens of megabytes and
 * there is no reason to hold one in memory to look at it once.
 *
 * A malformed line is skipped and counted. Both agents change their format
 * without notice, and a scanner that dies on an unknown line is a scanner
 * nobody runs twice. A file that vanishes mid-scan is the same story — an
 * agent may be writing while this runs.
 */
export class TranscriptReader {
  readonly stats: ReadStats = { entries: 0, skipped: 0 }

  async *read(path: string): AsyncIterable<TranscriptEntry> {
    const stream = createReadStream(path, 'utf8')
    stream.on('error', () => {})

    const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })

    let index = -1
    try {
      for await (const line of lines) {
        index++
        if (line.trim().length === 0) continue

        let payload: unknown
        try {
          payload = JSON.parse(line)
        } catch {
          this.stats.skipped++
          continue
        }

        this.stats.entries++
        yield { index, payload, line }
      }
    } catch {
      return
    }
  }
}
