import { basename, join } from 'node:path'
import { listJsonl, walkDirectories } from '#sources/listing'
import type { Source, TranscriptFile } from '#sources/source'
import { SourceName } from '#transcript/entry'
import { TranscriptReader } from '#transcript/reader'
import { objectField, stringField } from '#transcript/shape'

export class CodexSource implements Source {
  readonly name = SourceName.codex
  readonly #home: string

  constructor(home: string) {
    this.#home = home
  }

  async *discover(): AsyncIterable<TranscriptFile> {
    const root = join(this.#home, '.codex', 'sessions')

    for (const dir of await walkDirectories(root)) {
      for (const file of await listJsonl(dir)) {
        const path = join(dir, file)
        const meta = await firstMeta(path)
        yield {
          source: this.name,
          path,
          sessionId: meta === null ? basename(file, '.jsonl') : meta.id,
          project: meta === null ? basename(dir) : basename(meta.cwd),
        }
      }
    }
  }
}

async function firstMeta(path: string): Promise<{ id: string; cwd: string } | null> {
  const reader = new TranscriptReader()
  for await (const entry of reader.read(path)) {
    if (stringField(entry.payload, 'type') !== 'session_meta') continue

    const payload = objectField(entry.payload, 'payload')
    const id = stringField(payload, 'id')
    const cwd = stringField(payload, 'cwd')
    if (id !== null && cwd !== null) return { id, cwd }
  }
  return null
}
