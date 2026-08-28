import { readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Every listing here swallows its error. A missing `~/.codex` means the user
 *  does not run Codex, which is not a failure, and a directory that disappears
 *  mid-scan is an agent writing while this runs. */

export async function listDirectories(root: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** The two extensions this tool reads. A literal at the call site would not
 *  fail on a typo — it would list nothing and report a clean machine. */
export const FileExtension = { jsonl: '.jsonl', markdown: '.md' } as const

export type FileExtension = (typeof FileExtension)[keyof typeof FileExtension]

export async function listFiles(dir: string, extension: FileExtension): Promise<readonly string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * The real path of an instruction file, or null if there is not one there.
 *
 * The two instruction files are looked up by exact path rather than listed, and
 * they are the one place a symlink is likely: a dotfiles-managed
 * `~/.claude/CLAUDE.md` is usually a link into another directory. Resolving it
 * here means everything downstream — the reported path and, more importantly,
 * the file `wipe` rewrites — refers to the file that actually holds the text.
 * Rewriting through the link instead would replace the link with a regular file
 * and leave the credential sitting in the real one, then report success.
 *
 * Swallows its error for the same reason the listings do, which also covers a
 * dangling link.
 */
export async function resolveFile(path: string): Promise<string | null> {
  try {
    const real = await realpath(path)
    return (await stat(real)).isFile() ? real : null
  } catch {
    return null
  }
}

/** The directory and every directory beneath it. Codex nests sessions as
 *  YYYY/MM/DD; walking keeps that Codex's business rather than this code's. */
export async function walkDirectories(root: string): Promise<readonly string[]> {
  const found = [root]
  for (const name of await listDirectories(root)) {
    found.push(...(await walkDirectories(join(root, name))))
  }
  return found
}
