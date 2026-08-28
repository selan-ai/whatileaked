import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DISCLOSURE } from '#report/disclosure'
import type { Finding } from '#report/finding'
import { TerminalReporter } from '#report/terminal-reporter'
import { FileKind } from '#sources/source'

function render(findings: readonly Finding[]): string {
  const lines: string[] = []
  new TerminalReporter((line) => lines.push(line)).report(findings, {
    transcripts: 12,
    memoryFiles: 0,
    entries: 400,
    skipped: 1,
    unscannable: 0,
  })
  return lines.join('\n')
}

const finding: Finding = {
  rule: 'aws-access-token',
  fingerprint: '0a3f8c21ffff',
  context: 'const SECOND_AWS_KEY = ',
  source: 'claude-code',
  kind: FileKind.transcript,
  project: 'billing-api',
  file: '/tmp/abc-123.jsonl',
  at: 412,
}

test('does not repeat the banner title', () => {
  assert.ok(!render([finding]).startsWith('whatileaked'))
})

test('reports the rule, project and fingerprint', () => {
  const output = render([finding])
  assert.match(output, /aws-access-token/)
  assert.match(output, /billing-api/)
  assert.match(output, /0a3f8c21/)
})

test('says sent, never stored', () => {
  const output = render([finding])
  assert.match(output, /sent to a model provider/)
  assert.ok(!output.includes('stored'))
})

test('prints the file so a finding can be checked', () => {
  assert.match(render([finding]), /abc-123\.jsonl/)
})

test('shows the masked lead-in so a fixture is obvious', () => {
  assert.match(render([finding]), /const SECOND_AWS_KEY =/)
})

test('explains what the fingerprint is', () => {
  assert.match(render([finding]), /fingerprint, never the secret/)
})

test('carries no ansi codes when output is not a terminal', () => {
  // Tests do not run against a TTY, so this also guards every other assertion
  // here from matching against escape sequences.
  assert.ok(!render([finding]).includes(String.fromCharCode(27)))
})

test('always carries the disclosure', () => {
  assert.ok(render([finding]).includes(DISCLOSURE))
  assert.ok(render([]).includes(DISCLOSURE))
})

test('a clean scan says so plainly', () => {
  assert.match(render([]), /No credentials found/)
})

test('entries the engine refused are surfaced, not swallowed', () => {
  const lines: string[] = []
  new TerminalReporter((line) => lines.push(line)).report([finding], {
    transcripts: 12,
    memoryFiles: 0,
    entries: 400,
    skipped: 1,
    unscannable: 7,
  })
  assert.match(lines.join('\n'), /7 messages could not be scanned/)
})
