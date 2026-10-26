import { join } from 'node:path'
import {
  FileExtension,
  listDirectories,
  listFiles,
  resolveFile,
  walkDirectories,
} from '#sources/listing'
import { FileKind, type ScanFile, type Source } from '#sources/source'
import { SourceName } from '#transcript/entry'

/**
 * Gemini CLI keeps one folder per project under `~/.gemini/tmp/`, named by a
 * short slug of the project folder — or, before it migrated them, a SHA-256 of
 * the project path. Each holds `chats/`, one JSONL file per session with
 * subagents in a subfolder, and `memory/`, the notes it saves for the project.
 * Sessions from before the JSONL format are a single `.json` document each,
 * converted only when resumed, so both are read.
 *
 * `~/.gemini/GEMINI.md` is its global instruction file, loaded into every
 * session.
 */
export class GeminiCliSource implements Source {
  readonly name = SourceName['gemini-cli']
  readonly #dir: string

  /** `dir` is `~/.gemini`, or `$GEMINI_CLI_HOME/.gemini` when that is set. */
  constructor(home: string, dir: string = join(home, '.gemini')) {
    this.#dir = dir
  }

  async *discover(): AsyncIterable<ScanFile> {
    const instructions = await resolveFile(join(this.#dir, 'GEMINI.md'))
    if (instructions !== null) {
      yield { source: this.name, kind: FileKind.memory, path: instructions, project: this.name }
    }

    const root = join(this.#dir, 'tmp')
    for (const id of await listDirectories(root)) {
      // A hash names no project a reader would recognise; the slug does.
      const project = legacyHash.test(id) ? this.name : id

      for (const dir of await walkDirectories(join(root, id, 'chats'))) {
        for (const extension of [FileExtension.jsonl, FileExtension.json]) {
          for (const file of await listFiles(dir, extension)) {
            yield { source: this.name, kind: FileKind.transcript, path: join(dir, file), project }
          }
        }
      }

      for (const dir of await walkDirectories(join(root, id, 'memory'))) {
        for (const file of await listFiles(dir, FileExtension.markdown)) {
          yield { source: this.name, kind: FileKind.memory, path: join(dir, file), project }
        }
      }
    }
  }
}

const legacyHash = /^[0-9a-f]{64}$/
