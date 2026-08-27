/** Closed set, constructed here and matched against argv. */
export const Command = {
  home: 'home',
  scan: 'scan',
  wipe: 'wipe',
} as const

export type Command = (typeof Command)[keyof typeof Command]

/**
 * No argument shows the home screen rather than scanning.
 *
 * Scanning used to be the default, which kept `npx whatileaked` a single word.
 * `wipe` changed that: a tool with a destructive subcommand should introduce
 * itself before it does anything, even something harmless.
 */
export function parseCommand(argv: readonly string[]): Command | null {
  const first = argv[0]
  if (first === undefined) return Command.home
  if (first === Command.scan || first === Command.wipe) return first
  return null
}
