import assert from 'node:assert/strict'
import { test } from 'node:test'
import { home } from '#report/home'

const rendered = (): string => home().join('\n')

test('names both commands', () => {
  assert.match(rendered(), /whatileaked scan/)
  assert.match(rendered(), /whatileaked wipe/)
})

test('warns that wipe rewrites files, on the home screen itself', () => {
  assert.match(rendered(), /rewrites files/)
})

test('states the no-network promise where someone deciding to run it will see it', () => {
  assert.match(rendered(), /No network/)
})

test('discloses Selan rather than leaving it to be discovered', () => {
  assert.match(rendered(), /selan\.ai/)
})

test('carries no ansi codes when output is not a terminal', () => {
  assert.ok(!rendered().includes(String.fromCharCode(27)))
})
