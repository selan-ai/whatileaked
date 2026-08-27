import { createInterface } from 'node:readline/promises'

/** What the user must type. A word rather than "y" — this rewrites files that
 *  cannot be recovered, and a reflexive keystroke should not be enough. */
export const CONFIRMATION = 'wipe'

export interface Prompt {
  ask(question: string): Promise<string>
}

/**
 * Reads one line from the terminal.
 *
 * Refuses when stdin is not a terminal, which is the important case: a piped or
 * scripted run must not be able to answer this question, or `yes | whatileaked
 * wipe` quietly rewrites a machine's entire history.
 */
export class TerminalPrompt implements Prompt {
  async ask(question: string): Promise<string> {
    if (process.stdin.isTTY !== true) return ''

    const readline = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return (await readline.question(question)).trim()
    } finally {
      readline.close()
    }
  }
}
