import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface MemoryLine {
  /** One-based, so it matches what an editor shows. */
  number: number
  text: string
}

/**
 * Every non-blank line of a markdown file, numbered.
 *
 * Not `TranscriptReader`: that one parses each line as JSON and counts the
 * failures, so it would reject every line here and report the file as entirely
 * malformed.
 *
 * Blank lines are skipped but still counted, so a reported number points at the
 * right line of the real file. Streamed rather than read whole for the same
 * reason transcripts are, and because a file that vanishes mid-scan is an agent
 * writing while this runs.
 */
export async function* readLines(path: string): AsyncIterable<MemoryLine> {
  const stream = createReadStream(path, 'utf8')
  stream.on('error', () => {})

  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })

  let number = 0
  try {
    for await (const text of lines) {
      number++
      if (text.trim().length === 0) continue
      yield { number, text }
    }
  } catch {
    return
  }
}
