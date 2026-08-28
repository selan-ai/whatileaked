import { readdir, stat } from 'node:fs/promises'
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

/** For the two instruction files, which are looked up by exact path rather than
 *  listed. Swallows its error for the same reason the listings do. */
export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
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
