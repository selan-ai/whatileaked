import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SilentProgress } from '#report/progress'
import { TerminalReporter } from '#report/terminal-reporter'
import { fakeBase32 } from '#scan/fake-secret'
import { KeywordIndex } from '#scan/keyword-index'
import { compileRules } from '#scan/rule'
import { Scanner } from '#scan/scanner'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'
import { ScanRun } from '#scan-run'
import { ClaudeCodeSource } from '#sources/claude-code-source'

const scanner = (): Scanner => new Scanner(new KeywordIndex(compileRules(SECRET_RULE_SOURCES)))

test('finds a planted key end to end and reports its project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-e2e-'))
  const dir = join(root, '.claude', 'projects', '-Users-t-Repositories-demo')
  await mkdir(dir, { recursive: true })

  const key = `AKIA${fakeBase32(9, 16)}`
  await writeFile(
    join(dir, 'sess-1.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-1', cwd: '/Users/t/Repositories/demo', type: 'user' }),
      JSON.stringify({ type: 'user', message: { content: `export AWS_ACCESS_KEY_ID=${key}` } }),
    ].join('\n'),
  )

  const lines: string[] = []
  const run = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter((line) => lines.push(line)),
    new SilentProgress(),
  )

  assert.equal(await run.run(), 1)
  const output = lines.join('\n')
  assert.match(output, /aws-access-token/)
  assert.match(output, /demo/)
  assert.ok(!output.includes(key))
})

test('a clean home reports zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-e2e-'))
  const run = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter(() => {}),
    new SilentProgress(),
  )
  assert.equal(await run.run(), 0)
})
