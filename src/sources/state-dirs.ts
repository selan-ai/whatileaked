import { join, resolve } from 'node:path'

/**
 * Where an agent keeps its state: the default folder under the home directory,
 * and the one an environment variable moved it to, when set.
 *
 * Both, not either. Setting `CLAUDE_CONFIG_DIR` or `CODEX_HOME` leaves every
 * session written before it where it was, and those were sent all the same —
 * while reading only the default reported a clean machine for anyone who had
 * moved it. An empty value is ignored, as both agents ignore it.
 */
export function stateDirs(home: string, folder: string, moved: string | undefined): string[] {
  const dirs = [join(home, folder)]
  if (moved !== undefined && moved !== '') {
    const dir = resolve(moved)
    if (!dirs.includes(dir)) dirs.push(dir)
  }
  return dirs
}
