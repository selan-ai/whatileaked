import { basename, join } from 'node:path'
import {
  FileExtension,
  listDirectories,
  listFiles,
  resolveFile,
  walkDirectories,
} from '#sources/listing'
import { FileKind, type ScanFile, type Source } from '#sources/source'
import { SourceName } from '#transcript/entry'
import { TranscriptReader } from '#transcript/reader'
import { stringField } from '#transcript/shape'

export class ClaudeCodeSource implements Source {
  readonly name = SourceName['claude-code']
  readonly #home: string

  constructor(home: string) {
    this.#home = home
  }

  async *discover(): AsyncIterable<ScanFile> {
    const instructions = await resolveFile(join(this.#home, '.claude', 'CLAUDE.md'))
    if (instructions !== null) {
      // No project owns this file — it loads into every session regardless of
      // where the agent is running, so the source name is the honest label.
      yield { source: this.name, kind: FileKind.memory, path: instructions, project: this.name }
    }

    const root = join(this.#home, '.claude', 'projects')

    for (const slug of await listDirectories(root)) {
      const dir = join(root, slug)
      let project = slug

      // Walked rather than listed: a session's subagents get their own
      // transcripts under `<session>/subagents/`, and a subagent is handed the
      // parent's context — so a credential pasted into the session is in those
      // files too. Listing only the top level missed them, which meant the
      // count printed after a scan was smaller than the number of transcripts
      // on disk while claiming to be all of them.
      for (const nested of await walkDirectories(dir)) {
        for (const file of await listFiles(nested, FileExtension.jsonl)) {
          const path = join(nested, file)
          const cwd = await firstCwd(path)
          if (cwd !== null) project = basename(cwd)

          yield {
            source: this.name,
            kind: FileKind.transcript,
            path,
            project: cwd === null ? slug : basename(cwd),
          }
        }
      }

      // A memory file carries no session metadata to read a working directory
      // out of, so it borrows the name its sibling transcripts resolved. The
      // raw slug is the path-mangled cwd — `-Users-t-Repositories-alpha` where
      // the transcripts beside it say `alpha` — and printing both spellings of
      // one project in a single report reads as two projects.
      for (const nested of await walkDirectories(join(dir, 'memory'))) {
        for (const file of await listFiles(nested, FileExtension.markdown)) {
          yield {
            source: this.name,
            kind: FileKind.memory,
            path: join(nested, file),
            project,
          }
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
