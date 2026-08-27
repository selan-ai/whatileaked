const SPINNER = ['|', '/', '-', '\\'] as const

/** Erase the whole line, so a shorter repaint cannot leave debris behind. */
const CLEAR_LINE = `${String.fromCharCode(27)}[2K`

export interface Progress {
  start(): void
  /** Called as each transcript is opened, so the line reflects real work. */
  advance(transcripts: number, project: string): void
  done(): void
}

/**
 * A single line that rewrites itself while the scan runs.
 *
 * A scan of a busy machine takes the better part of a minute with nothing to
 * show for it, and silence for that long reads as a hang. Naming the project
 * currently being read also answers the question people actually have while
 * waiting, which is what this thing is looking at.
 *
 * Writes to stderr so the report on stdout stays pipeable and screenshot-clean.
 */
export class TerminalProgress implements Progress {
  readonly #write: (text: string) => void
  readonly #enabled: boolean
  #frame = 0

  constructor(write: (text: string) => void, enabled: boolean) {
    this.#write = write
    this.#enabled = enabled
  }

  start(): void {}

  advance(transcripts: number, project: string): void {
    if (!this.#enabled) return

    // Not every file: at ~600 transcripts this would repaint faster than a
    // terminal can usefully show, and the syscalls are not free.
    if (transcripts % 8 !== 0) return

    const spinner = SPINNER[this.#frame % SPINNER.length] ?? '|'
    this.#frame++

    this.#write(`\r${CLEAR_LINE}  ${spinner} reading ${transcripts} transcripts — ${clip(project)}`)
  }

  done(): void {
    if (this.#enabled) this.#write(`\r${CLEAR_LINE}`)
  }
}

/** Long project names would wrap and leave debris behind the repaint. */
function clip(project: string): string {
  return project.length > 40 ? `${project.slice(0, 39)}…` : project
}

/** Progress that draws nothing — for pipes, CI, and tests. */
export class SilentProgress implements Progress {
  start(): void {}
  advance(): void {}
  done(): void {}
}
