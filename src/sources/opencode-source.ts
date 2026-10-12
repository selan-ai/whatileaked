import { basename, join } from 'node:path'
import { FileExtension, listFiles } from '#sources/listing'
import { FileKind, type ScanFile, type Source, type StoredMessage } from '#sources/source'
import { SourceName } from '#transcript/entry'

export type Sqlite = typeof import('node:sqlite')

/**
 * opencode keeps every session in one SQLite database under the XDG data
 * directory — `opencode.db`, or `opencode-<channel>.db` for a pre-release
 * channel — and never inside a repo.
 *
 * Only `session_message` is read. The same file holds provider credentials
 * opencode stores for itself, and those were never sent anywhere; reading them
 * would turn "sent to a model provider" into a claim this tool cannot defend.
 *
 * `node:sqlite` loads without a flag from Node 22.13, and this package supports
 * Node 20, so it is feature-detected. Where it is missing the database is still
 * yielded, with no reader, so the report can say it was found and not read
 * rather than count it as clean.
 */
export class OpencodeSource implements Source {
  readonly name = SourceName.opencode
  readonly #home: string
  readonly #load: () => Promise<Sqlite | null>

  constructor(home: string, load: () => Promise<Sqlite | null> = loadSqlite) {
    this.#home = home
    this.#load = load
  }

  async *discover(): AsyncIterable<ScanFile> {
    const dir = join(this.#home, '.local', 'share', 'opencode')
    for (const file of await listFiles(dir, FileExtension.database)) {
      const path = join(dir, file)
      const sqlite = await this.#load()
      yield {
        source: this.name,
        kind: FileKind.transcript,
        path,
        project: this.name,
        messages: sqlite === null ? null : () => readMessages(sqlite, path, this.name),
      }
    }
  }
}

/** Read-only, so a running opencode is never blocked or written to; committed
 *  rows still in the write-ahead log are visible to it all the same. */
async function* readMessages(
  sqlite: Sqlite,
  path: string,
  fallback: string,
): AsyncIterable<StoredMessage> {
  const db = new sqlite.DatabaseSync(path, { readOnly: true })
  try {
    // The session table was renamed to `session_v2` in a schema migration;
    // whichever exists names the working directory.
    const directories = new Map<string, string>()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
      .all('session', 'session_v2')
    for (const { name } of tables) {
      for (const row of db.prepare(`SELECT id, directory FROM "${String(name)}"`).iterate()) {
        if (typeof row.id === 'string' && typeof row.directory === 'string') {
          directories.set(row.id, row.directory)
        }
      }
    }

    for (const row of db.prepare('SELECT session_id, data FROM session_message').iterate()) {
      if (typeof row.data !== 'string') continue
      const directory = typeof row.session_id === 'string' ? directories.get(row.session_id) : null
      yield { project: directory == null ? fallback : basename(directory), text: row.data }
    }
  } finally {
    db.close()
  }
}

let loading: Promise<Sqlite | null> | null = null

export function loadSqlite(): Promise<Sqlite | null> {
  loading ??= importSqlite()
  return loading
}

/** Node 22 and 23 announce the module as experimental on first load, and that
 *  warning would land in the middle of the progress line. Only it is dropped. */
async function importSqlite(): Promise<Sqlite | null> {
  const emitWarning = process.emitWarning
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (String(warning).includes('SQLite')) return
    Reflect.apply(emitWarning, process, [warning, ...rest])
  }) as typeof process.emitWarning
  try {
    // Through a variable: the bundler strips `node:` from a literal specifier,
    // and this module exists only under the prefixed name.
    const specifier = 'node:sqlite'
    return (await import(specifier)) as Sqlite
  } catch {
    return null
  } finally {
    process.emitWarning = emitWarning
  }
}
