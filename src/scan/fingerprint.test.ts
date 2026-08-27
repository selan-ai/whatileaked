import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fingerprint } from '#scan/fingerprint'

test('is twelve hex characters', () => {
  assert.match(fingerprint('some-secret-value'), /^[0-9a-f]{12}$/)
})

test('is stable across calls, so a repeat leak correlates', () => {
  assert.equal(fingerprint('some-secret-value'), fingerprint('some-secret-value'))
})

test('differs for different secrets', () => {
  assert.notEqual(fingerprint('a-secret'), fingerprint('b-secret'))
})

test('does not contain the secret', () => {
  assert.ok(!fingerprint('hunter2hunter2').includes('hunter2'))
})
