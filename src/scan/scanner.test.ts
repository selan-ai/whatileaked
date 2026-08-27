import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeBase32 } from '#scan/fake-secret'
import { fingerprint } from '#scan/fingerprint'
import { KeywordIndex } from '#scan/keyword-index'
import { compileRules } from '#scan/rule'
import { Scanner } from '#scan/scanner'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'

const scanner = new Scanner(new KeywordIndex(compileRules(SECRET_RULE_SOURCES)))

const awsKey = (seed: number): string => `AKIA${fakeBase32(seed, 16)}`

test('clean text yields nothing', () => {
  assert.deepEqual(scanner.scan('const total = items.reduce((a, b) => a + b, 0)'), [])
})

test('finds an aws access key', () => {
  const matches = scanner.scan(`AWS_ACCESS_KEY_ID=${awsKey(1)}`)
  assert.ok(matches.some((m) => m.rule === 'aws-access-token'))
})

test('ignores the aws example key upstream allowlists', () => {
  const matches = scanner.scan('AKIAIOSFODNN7EXAMPLE')
  assert.ok(!matches.some((m) => m.rule === 'aws-access-token'))
})

test('reports one match per distinct secret, not per occurrence', () => {
  const key = awsKey(2)
  const matches = scanner.scan(`${key} and again ${key}`)
  assert.equal(matches.filter((m) => m.rule === 'aws-access-token').length, 1)
})

test('finds a secret hidden inside a base64 blob', () => {
  const encoded = Buffer.from(`aws credentials for the deploy job: ${awsKey(3)}`).toString('base64')
  assert.ok(scanner.scan(encoded).some((m) => m.rule === 'aws-access-token'))
})

test('the reported fingerprint is the hash of the secret alone', () => {
  const key = awsKey(4)
  const match = scanner.scan(key).find((m) => m.rule === 'aws-access-token')
  assert.ok(match)
  assert.equal(match.fingerprint, fingerprint(key))
})

test('no match object carries any part of the secret', () => {
  const key = awsKey(5)
  for (const match of scanner.scan(key)) {
    assert.ok(!JSON.stringify(match).includes(key.slice(0, 8)))
  }
})
