import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
import { CONFIRMATION, type Prompt } from '#wipe/confirm'
import { WipeRun } from '#wipe/wipe-run'

const scanner = (): Scanner => new Scanner(new KeywordIndex(compileRules(SECRET_RULE_SOURCES)))

class ScriptedPrompt implements Prompt {
  readonly #answer: string
  asked = 0

  constructor(answer: string) {
    this.#answer = answer
  }

  async ask(): Promise<string> {
    this.asked++
    return this.#answer
  }
}

async function home(key: string): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-wipe-'))
  const dir = join(root, '.claude', 'projects', '-Users-t-Repositories-demo')
  await mkdir(dir, { recursive: true })

  const file = join(dir, 'sess-1.jsonl')
  await writeFile(
    file,
    [
      JSON.stringify({ sessionId: 'sess-1', cwd: '/Users/t/Repositories/demo', type: 'user' }),
      JSON.stringify({ type: 'user', message: { content: `export AWS_ACCESS_KEY_ID=${key}` } }),
      JSON.stringify({ type: 'assistant', message: { content: 'nothing sensitive here' } }),
    ].join('\n'),
  )

  return { root, file }
}

function run(root: string, prompt: Prompt): WipeRun {
  return new WipeRun([new ClaudeCodeSource(root)], scanner(), prompt, () => {})
}

test('rewrites the secret out of the transcript once confirmed', async () => {
  const key = `AKIA${fakeBase32(71, 16)}`
  const { root, file } = await home(key)

  const outcome = await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  assert.equal(outcome.confirmed, true)
  assert.equal(outcome.filesRewritten, 1)
  assert.ok(outcome.secretsRedacted >= 1)

  const after = await readFile(file, 'utf8')
  assert.ok(!after.includes(key), 'the secret must be gone')
  assert.match(after, /REDACTED BY whatileaked: aws-access-token/)
})

test('leaves every file untouched when the answer is anything else', async () => {
  const key = `AKIA${fakeBase32(72, 16)}`
  const { root, file } = await home(key)
  const before = await readFile(file, 'utf8')

  const outcome = await run(root, new ScriptedPrompt('y')).run()

  assert.equal(outcome.confirmed, false)
  assert.equal(outcome.filesRewritten, 0)
  assert.equal(await readFile(file, 'utf8'), before)
})

test('an empty answer — what a non-terminal stdin gives — declines', async () => {
  const key = `AKIA${fakeBase32(73, 16)}`
  const { root, file } = await home(key)
  const before = await readFile(file, 'utf8')

  const outcome = await run(root, new ScriptedPrompt('')).run()

  assert.equal(outcome.confirmed, false)
  assert.equal(await readFile(file, 'utf8'), before)
})

test('every surviving line is still valid json', async () => {
  const key = `AKIA${fakeBase32(74, 16)}`
  const { root, file } = await home(key)

  await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim() !== '')
  assert.equal(lines.length, 3)
  for (const line of lines) assert.doesNotThrow(() => JSON.parse(line))
})

test('untouched lines are preserved byte for byte', async () => {
  const key = `AKIA${fakeBase32(75, 16)}`
  const { root, file } = await home(key)
  const before = (await readFile(file, 'utf8')).split('\n')

  await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  const after = (await readFile(file, 'utf8')).split('\n')
  assert.equal(after[0], before[0])
  assert.equal(after[2], before[2])
  assert.notEqual(after[1], before[1])
})

test('never asks when there is nothing to wipe', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-wipe-'))
  const prompt = new ScriptedPrompt(CONFIRMATION)

  const outcome = await run(root, prompt).run()

  assert.equal(prompt.asked, 0)
  assert.deepEqual(outcome.planned, [])
  assert.equal(outcome.confirmed, false)
})

test('wipes a secret hidden inside a base64 blob', async () => {
  // The blob has no literal secret to replace, so the whole run must go.
  // Reporting one and failing to remove it is the worst outcome for a tool
  // whose entire job is removing them.
  const key = `AKIA${fakeBase32(77, 16)}`
  const blob = Buffer.from(`aws credentials for the deploy job: ${key}`).toString('base64')

  const root = await mkdtemp(join(tmpdir(), 'whatileaked-wipe-'))
  const dir = join(root, '.claude', 'projects', '-Users-t-demo')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'sess-b64.jsonl')
  await writeFile(
    file,
    [
      JSON.stringify({ sessionId: 'b64', cwd: '/Users/t/demo', type: 'user' }),
      JSON.stringify({ type: 'user', message: { content: blob } }),
    ].join('\n'),
  )

  await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  const after = await readFile(file, 'utf8')
  assert.ok(!after.includes(blob), 'the encoded run must be gone')
  assert.match(after, /REDACTED BY whatileaked/)
})

test('a scan after a wipe finds nothing — the two must agree', async () => {
  const key = `AKIA${fakeBase32(78, 16)}`
  const blob = Buffer.from(`aws credentials for the deploy job: ${key}`).toString('base64')

  const root = await mkdtemp(join(tmpdir(), 'whatileaked-wipe-'))
  const dir = join(root, '.claude', 'projects', '-Users-t-demo')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'sess-both.jsonl'),
    [
      JSON.stringify({ sessionId: 'both', cwd: '/Users/t/demo', type: 'user' }),
      JSON.stringify({ type: 'user', message: { content: `plain ${key}` } }),
      JSON.stringify({ type: 'user', message: { content: blob } }),
    ].join('\n'),
  )

  await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  const lines: string[] = []
  const scan = new ScanRun(
    [new ClaudeCodeSource(root)],
    scanner(),
    new TerminalReporter((line) => lines.push(line)),
    new Progress(() => {}, false),
  )
  assert.equal(await scan.run(), 0, lines.join('\n'))
})

test('a second wipe finds nothing left', async () => {
  const key = `AKIA${fakeBase32(76, 16)}`
  const { root } = await home(key)

  await run(root, new ScriptedPrompt(CONFIRMATION)).run()
  const second = await run(root, new ScriptedPrompt(CONFIRMATION)).run()

  assert.deepEqual(second.planned, [])
})
