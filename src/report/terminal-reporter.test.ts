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

test('counts memory files in the scanned line', () => {
  const lines: string[] = []
  new TerminalReporter((line) => lines.push(line)).report([], {
    transcripts: 3,
    memoryFiles: 2,
    entries: 40,
    skipped: 0,
    unscannable: 0,
  })

  assert.match(lines.join('\n'), /3 transcripts · 40 messages · 2 memory files/)
})

test('says nothing about files on disk when every finding is a transcript', () => {
  const output = render([finding])
  assert.match(output, /1 credential sent to a model provider/)
  assert.ok(!output.includes('still on disk'))
})

test('flags credentials that are still in files the agent reads', () => {
  const output = render([
    {
      ...finding,
      kind: FileKind.memory,
      project: 'claude-code',
      file: '/home/.claude/CLAUDE.md',
      at: 14,
    },
  ])

  assert.match(output, /CLAUDE\.md/)
  assert.match(output, /1 credential still on disk, in files your agent reads/)
  assert.match(output, /0 credentials sent to a model provider/)
})

test('a memory row never claims the credential was sent', () => {
  const memory: Finding = {
    ...finding,
    kind: FileKind.memory,
    file: '/home/.claude/projects/alpha/memory/notes.md',
  }

  // Two occurrences in one file, which for a transcript would render as
  // "sent 2 times" — directly above a headline saying none were sent.
  const output = render([memory, { ...memory, at: 20 }])

  assert.match(output, /on 2 lines/)
  assert.ok(!output.includes('sent 2 times'))
  assert.ok(!output.includes('sent once'))
})

test('a single memory occurrence reads as one line, not one send', () => {
  const output = render([{ ...finding, kind: FileKind.memory, file: '/h/.claude/CLAUDE.md' }])

  assert.match(output, /on one line/)
  assert.ok(!output.includes('sent once'))
})
