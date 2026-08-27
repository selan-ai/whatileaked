/** `~` for the home directory: the full path is noise in a terminal and a
 *  username in a screenshot. */
export function shorten(file: string): string {
  const home = process.env.HOME
  return home !== undefined && file.startsWith(home) ? `~${file.slice(home.length)}` : file
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}
