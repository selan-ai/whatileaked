import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shannonEntropy } from '#scan/entropy'

test('a single repeated character carries no information', () => {
  assert.equal(shannonEntropy('aaaaaaaa'), 0)
})

test('an empty string is zero rather than NaN', () => {
  assert.equal(shannonEntropy(''), 0)
})

test('two equally frequent characters are one bit each', () => {
  assert.equal(shannonEntropy('abab'), 1)
})

test('a random-looking key scores above the gitleaks thresholds', () => {
  assert.ok(shannonEntropy('xQ7pL29fVn4TzR8sKd1WbY6mHc3JgA5e') > 3.8)
})
