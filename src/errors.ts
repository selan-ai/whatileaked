export class UnknownCommandError extends Error {
  readonly command: string

  constructor(command: string) {
    super(`unknown command "${command}" — expected "scan" or "wipe"`)
    this.name = 'UnknownCommandError'
    this.command = command
  }
}
