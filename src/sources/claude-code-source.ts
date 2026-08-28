import { basename, join } from 'node:path'
import { FileExtension, listDirectories, listFiles } from '#sources/listing'
import type { Source, TranscriptFile } from '#sources/source'
import { SourceName } from '#transcript/entry'
import { TranscriptReader } from '#transcript/reader'
import { stringField } from '#transcript/shape'

export class ClaudeCodeSource implements Source {
  readonly name = SourceName['claude-code']
  readonly #home: string

  constructor(home: string) {
    this.#home = home
  }

  async *discover(): AsyncIterable<TranscriptFile> {
    const root = join(this.#home, '.claude', 'projects')

    for (const slug of await listDirectories(root)) {
      const dir = join(root, slug)
      for (const file of await listFiles(dir, FileExtension.jsonl)) {
        const path = join(dir, file)
        const cwd = await firstCwd(path)
        yield {
          source: this.name,
          path,
          project: cwd === null ? slug : basename(cwd),
        }
      }
    }
  }
}

/** The cwd of the first entry carrying both a sessionId and a cwd. Early lines
 *  are often summaries or file-history snapshots and carry neither; the
 *  sessionId stays in the predicate because it marks the first real entry, even
 *  though nothing reads the value. */
async function firstCwd(path: string): Promise<string | null> {
  const reader = new TranscriptReader()
  for await (const entry of reader.read(path)) {
    const sessionId = stringField(entry.payload, 'sessionId')
    const cwd = stringField(entry.payload, 'cwd')
    if (sessionId !== null && cwd !== null) return cwd
  }
  return null
}
