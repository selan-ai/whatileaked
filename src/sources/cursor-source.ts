import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { FileExtension, listDirectories, listFiles, walkDirectories } from '#sources/listing'
import { FileKind, type ScanFile, type Source } from '#sources/source'
import { SourceName } from '#transcript/entry'

/**
 * Cursor's agent transcripts, which are jsonl and need no schema of their own —
 * the scanner reads the raw line either way.
 *
 * Cursor also keeps older Ask-mode chats in SQLite (`state.vscdb` and
 * `conversation-search.db`). Those are deliberately out of scope: reading them
 * needs `node:sqlite`, which arrived in Node 22.5, and this package supports
 * Node 20. The README says so rather than leaving it as a silent gap.
 */
export class CursorSource implements Source {
  readonly name = SourceName.cursor
  readonly #home: string

  constructor(home: string) {
    this.#home = home
  }

  async *discover(): AsyncIterable<ScanFile> {
    const root = join(this.#home, '.cursor', 'projects')

    for (const slug of await listDirectories(root)) {
      const project = await projectName(slug)

      // Only this subtree: a project directory also holds `canvases`, which
      // carries a node_modules of its own.
      for (const dir of await walkDirectories(join(root, slug, 'agent-transcripts'))) {
        for (const file of await listFiles(dir, FileExtension.jsonl)) {
          yield {
            source: this.name,
            kind: FileKind.transcript,
            path: join(dir, file),
            project,
          }
        }
      }
    }
  }
}

/** The slug when it does not name a directory that still exists — a workspace
 *  that moved, or `empty-window`, which was never a path at all. */
async function projectName(slug: string): Promise<string> {
  const path = await resolveSlug(slug)
  return path === null ? slug : basename(path)
}

/**
 * The workspace path a project slug was made from.
 *
 * Cursor names the directory after the workspace path with every `/` replaced
 * by `-`, and records no working directory inside the transcript, so the slug
 * is the only thing to go on. Splitting on `-` is not enough: a directory
 * called `deploy-tool` would come back as `tool`. So the segments are rejoined
 * greedily from the left, and the filesystem decides where each one ends.
 *
 * This is the one place the tool looks outside `~/.cursor`, and it only ever
 * calls `stat` on a directory the slug already named. Nothing is opened and
 * nothing is read.
 */
async function resolveSlug(slug: string): Promise<string | null> {
  const parts = slug.split('-')
  let path = ''
  let index = 0

  while (index < parts.length) {
    let end = index
    let candidate = `${path}/${parts[index]}`

    while (!(await isDirectory(candidate)) && end + 1 < parts.length) {
      end++
      candidate = `${candidate}-${parts[end]}`
    }

    if (!(await isDirectory(candidate))) return null

    path = candidate
    index = end + 1
  }

  return path === '' ? null : path
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
