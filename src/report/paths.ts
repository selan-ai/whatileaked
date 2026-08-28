import { realpathSync } from 'node:fs'

/** `~` for the home directory: the full path is noise in a terminal and a
 *  username in a screenshot. */
export function shorten(file: string): string {
  const home = process.env.HOME
  if (home === undefined) return file
  if (file.startsWith(home)) return `~${file.slice(home.length)}`

  // An instruction file's path has been through `realpath`, so if `$HOME` is
  // itself a symlink the two spellings never match textually and the username
  // this function exists to hide would be printed in full. Reached only when
  // the plain comparison already failed, which on an ordinary machine is never.
  const real = realHome(home)
  return file.startsWith(real) ? `~${file.slice(real.length)}` : file
}

function realHome(home: string): string {
  try {
    return realpathSync(home)
  } catch {
    // An unresolvable $HOME is not this function's problem to report.
    return home
  }
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}
