import { basename, join } from 'node:path'
import { listDirectories, listJsonl } from '#sources/listing'
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
      for (const file of await listJsonl(dir)) {
        const path = join(dir, file)
        const meta = await firstMeta(path)
        yield {
          source: this.name,
          path,
          sessionId: meta === null ? basename(file, '.jsonl') : meta.sessionId,
          project: meta === null ? slug : basename(meta.cwd),
        }
      }
    }
  }
}

/** The first entry carrying both fields. Early lines are often summaries or
 *  file-history snapshots and carry neither. */
async function firstMeta(path: string): Promise<{ sessionId: string; cwd: string } | null> {
  const reader = new TranscriptReader()
  for await (const entry of reader.read(path)) {
    const sessionId = stringField(entry.payload, 'sessionId')
    const cwd = stringField(entry.payload, 'cwd')
    if (sessionId !== null && cwd !== null) return { sessionId, cwd }
  }
  return null
}
