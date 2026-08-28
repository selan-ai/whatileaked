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
        const cwd = await firstCwd(path)
        yield {
          source: this.name,
          path,
          project: cwd === null ? basename(dir) : basename(cwd),
        }
      }
    }
  }
}

/** As in the Claude Code source, the id stays in the predicate but its value is
 *  discarded — it identifies the metadata entry, nothing reads it. */
async function firstCwd(path: string): Promise<string | null> {
  const reader = new TranscriptReader()
  for await (const entry of reader.read(path)) {
    if (stringField(entry.payload, 'type') !== 'session_meta') continue

    const payload = objectField(entry.payload, 'payload')
    const id = stringField(payload, 'id')
    const cwd = stringField(payload, 'cwd')
    if (id !== null && cwd !== null) return cwd
  }
  return null
}
