import { readdir } from 'node:fs/promises'
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

export async function listJsonl(dir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name)
  } catch {
    return []
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
