import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Progress } from '#report/progress'
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
    new Progress(() => {}, false),
  )

  assert.equal(await run.run(), 1)
  const output = lines.join('\n')
  assert.match(output, /aws-access-token/)
  assert.match(output, /demo/)
  assert.ok(!output.includes(key))
})

test('finds a planted key in a memory file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-e2e-'))
  await mkdir(join(root, '.claude'), { recursive: true })

  const key = `AKIA${fakeBase32(21, 16)}`
  await writeFile(
    join(root, '.claude', 'CLAUDE.md'),
    ['# Deploy notes', '', `Use AWS_ACCESS_KEY_ID=${key} for staging.`].join('\n'),
  )

  const lines: string[] = []
  const run = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter((line) => lines.push(line)),
    new Progress(() => {}, false),
  )

  assert.equal(await run.run(), 1)
  const output = lines.join('\n')
  assert.match(output, /aws-access-token/)
  assert.match(output, /CLAUDE\.md/)
  assert.ok(!output.includes(key))
})

test('a clean home reports zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-e2e-'))
  const run = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter(() => {}),
    new Progress(() => {}, false),
  )
  assert.equal(await run.run(), 0)
})

test('finds a planted key in prompt history and in a cached paste', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-e2e-'))
  await mkdir(join(root, '.claude', 'paste-cache'), { recursive: true })

  const inHistory = `AKIA${fakeBase32(31, 16)}`
  const inPaste = `AKIA${fakeBase32(32, 16)}`
  await writeFile(
    join(root, '.claude', 'history.jsonl'),
    JSON.stringify({
      display: 'deploy with [Pasted text #1 +2 lines]',
      pastedContents: { 1: { id: 1, type: 'text', content: `AWS_ACCESS_KEY_ID=${inHistory}\n` } },
      timestamp: 1760000000000,
      project: '/Users/t/Repositories/deploy-tool',
    }),
  )
  // The raw paste, not JSON: read as lines, it must not be skipped as malformed.
  await writeFile(
    join(root, '.claude', 'paste-cache', '3f2a9c.txt'),
    ['[default]', `aws_access_key_id = ${inPaste}`].join('\n'),
  )

  const lines: string[] = []
  const run = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter((line) => lines.push(line)),
    new Progress(() => {}, false),
  )

  assert.equal(await run.run(), 2)
  const output = lines.join('\n')
  assert.match(output, /history\.jsonl/)
  assert.match(output, /paste-cache/)
  assert.match(output, /2 credentials sent to a model provider/)
  assert.ok(!output.includes(inHistory) && !output.includes(inPaste))
})
