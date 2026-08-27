import assert from 'node:assert/strict'
import { test } from 'node:test'

test('node strips types natively', () => {
  const value: string = 'stripped'
  assert.equal(process.features.typescript, 'strip')
  assert.equal(value, 'stripped')
})
