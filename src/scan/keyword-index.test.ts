import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KeywordIndex } from '#scan/keyword-index'
import { CompiledRule } from '#scan/rule'

const rule = (id: string, keywords: readonly string[]): CompiledRule =>
  new CompiledRule({ id, keywords, pattern: 'x', group: 0, entropy: 0, allowlist: [] })

const RULES = [rule('aws', ['akia']), rule('gh', ['ghp_']), rule('slack', ['xoxb'])]

test('selects only the rules whose keyword appears', () => {
  const index = new KeywordIndex(RULES)
  assert.deepEqual(
    index.windows('token=ghp_abcdef').map((w) => w.rule.id),
    ['gh'],
  )
})

test('is case-insensitive, because keywords are stored lowercased', () => {
  const index = new KeywordIndex(RULES)
  assert.deepEqual(
    index.windows('AKIA1234').map((w) => w.rule.id),
    ['aws'],
  )
})

test('returns nothing for clean text, which is the common case', () => {
  const index = new KeywordIndex(RULES)
  assert.deepEqual(index.windows('const total = sum(items)'), [])
})

test('returns one window per rule even when two of its keywords match', () => {
  const index = new KeywordIndex([rule('multi', ['aaa', 'bbb'])])
  assert.equal(index.windows('aaa and bbb').length, 1)
})

test('a window covers the text around a hit, not the whole line', () => {
  const index = new KeywordIndex(RULES)
  const line = `${'x'.repeat(5000)} akia ${'y'.repeat(5000)}`
  const window = index.windows(line)[0]
  assert.ok(window)
  assert.ok(window.text.length < line.length)
  assert.ok(window.text.includes('akia'))
})
