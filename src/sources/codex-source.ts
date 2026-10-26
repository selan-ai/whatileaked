import { basename, join } from 'node:path'
import { FileExtension, listFiles, resolveFile, walkDirectories } from '#sources/listing'
import { FileKind, type ScanFile, type Source } from '#sources/source'
import { SourceName } from '#transcript/entry'
import { TranscriptReader } from '#transcript/reader'
import { objectField, stringField } from '#transcript/shape'

export class CodexSource implements Source {
  readonly name = SourceName.codex
  readonly #dir: string

  /** `dir` is where Codex keeps its state: `~/.codex`, or wherever
   *  `CODEX_HOME` moved it. */
  constructor(home: string, dir: string = join(home, '.codex')) {
    this.#dir = dir
  }

  async *discover(): AsyncIterable<ScanFile> {
    // Codex loads `AGENTS.override.md` in place of `AGENTS.md` when it has any
    // text, so the override is the file sent. `AGENTS.md` stays scanned: it was
    // sent in every session before the override existed, and is again once the
    // override is emptied.
    for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
      const instructions = await resolveFile(join(this.#dir, name))
      if (instructions !== null) {
        yield { source: this.name, kind: FileKind.memory, path: instructions, project: this.name }
      }
    }

    // Every prompt typed into any session, kept after the session's rollout is
    // archived or deleted. Each line was sent, so it is a transcript.
    const history = await resolveFile(join(this.#dir, 'history.jsonl'))
    if (history !== null) {
      yield { source: this.name, kind: FileKind.transcript, path: history, project: this.name }
    }

    // Archiving a conversation in Codex moves its rollout out of `sessions/`
    // into `archived_sessions/`. Archived is not deleted — everything in it was
    // still sent — and reading only `sessions/` reported a clean machine for
    // exactly the conversations someone had tidied away.
    for (const root of ['sessions', 'archived_sessions']) {
      for (const dir of await walkDirectories(join(this.#dir, root))) {
        for (const file of await listFiles(dir, FileExtension.jsonl)) {
          const path = join(dir, file)
          const cwd = await firstCwd(path)
          yield {
            source: this.name,
            kind: FileKind.transcript,
            path,
            project: cwd === null ? basename(dir) : basename(cwd),
          }
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
