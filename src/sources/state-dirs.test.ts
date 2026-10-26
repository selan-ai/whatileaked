import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { stateDirs } from '#sources/state-dirs'

test('reads the default folder when nothing moved it', () => {
  assert.deepEqual(stateDirs('/home/t', '.claude', undefined), [join('/home/t', '.claude')])
})

test('reads the moved folder as well as the default', () => {
  assert.deepEqual(stateDirs('/home/t', '.codex', '/srv/codex'), [
    join('/home/t', '.codex'),
    '/srv/codex',
  ])
})

test('ignores an empty value and a value naming the default', () => {
  assert.deepEqual(stateDirs('/home/t', '.claude', ''), [join('/home/t', '.claude')])
  assert.deepEqual(stateDirs('/home/t', '.claude', '/home/t/.claude/'), [
    join('/home/t', '.claude'),
  ])
})
