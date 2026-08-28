import { homedir } from 'node:os'
import { Command, parseCommand } from '#commands'
import { UnknownCommandError } from '#errors'
import { home } from '#report/home'
import { plural } from '#report/paths'
import { Progress } from '#report/progress'
import { bold, cyan, dim, green, red, yellow } from '#report/style'
import { TerminalReporter } from '#report/terminal-reporter'
import { KeywordIndex } from '#scan/keyword-index'
import { compileRules } from '#scan/rule'
import { Scanner } from '#scan/scanner'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'
import { ScanRun } from '#scan-run'
import { ClaudeCodeSource } from '#sources/claude-code-source'
import { CodexSource } from '#sources/codex-source'
import { CursorSource } from '#sources/cursor-source'
import type { Source } from '#sources/source'
import { TerminalPrompt } from '#wipe/confirm'
import { WipeRun } from '#wipe/wipe-run'

/**
 * The composition root. Every collaborator is built here and passed in by
 * constructor; nothing below constructs its own dependencies.
 *
 * Adding a source is one class and one entry in this array.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const command = parseCommand(argv)
  if (command === null) throw new UnknownCommandError(argv[0] ?? '')

  const write = (line: string): void => {
    process.stdout.write(`${line}\n`)
  }

  if (command === Command.home) {
    for (const line of home()) write(line)
    return 0
  }

  const sources: readonly Source[] = [
    new ClaudeCodeSource(homedir()),
    new CodexSource(homedir()),
    new CursorSource(homedir()),
  ]
  const scanner = new Scanner(new KeywordIndex(compileRules(SECRET_RULE_SOURCES)))

  return command === Command.wipe
    ? await wipe(sources, scanner, write)
    : await scan(sources, scanner, write)
}

/** The planet needs 24-bit colour and a terminal; everywhere else gets text. */
function colorful(): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined
}

async function scan(
  sources: readonly Source[],
  scanner: Scanner,
  write: (line: string) => void,
): Promise<number> {
  // `scan` is reachable directly, so this is the only place a reader who never
  // saw the home screen learns who wrote the thing they are running. `wipe`
  // already opens the same way.
  write(`  ${dim('Welcome to whatileaked — built by Selan')} ${cyan('(selan.ai)')}`)
  write(dim('  checking what you have already sent to a model provider'))
  write('')

  // Progress goes to stderr so the report on stdout stays pipeable, and the
  // class no-ops when that is not a terminal.
  const progress = new Progress((text: string) => process.stderr.write(text), colorful())

  return await new ScanRun(sources, scanner, new TerminalReporter(write), progress).run()
}

async function wipe(
  sources: readonly Source[],
  scanner: Scanner,
  write: (line: string) => void,
): Promise<number> {
  write(dim('  replacing credentials in your local transcripts with a placeholder'))
  write('')

  const outcome = await new WipeRun(sources, scanner, new TerminalPrompt(), write).run()

  if (outcome.planned.length === 0) {
    write(green('  No credentials found. Nothing to wipe.'))
    return 0
  }

  if (!outcome.confirmed) {
    write('')
    write(yellow('  Not confirmed. Nothing was changed.'))
    return 1
  }

  write('')
  write(
    green(
      `  Replaced ${plural(outcome.secretsRedacted, 'secret')} across ` +
        `${plural(outcome.filesRewritten, 'file')}.`,
    ),
  )
  write(bold(red('  Rotate every one of them — wiping your disk does not un-send them.')))
  return 0
}
