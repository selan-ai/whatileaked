import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matcherFor } from '#scan/matcher'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'

test('carries the full upstream rule set', () => {
  assert.ok(SECRET_RULE_SOURCES.length > 150)
})

test('every rule has an id, a pattern and at least one keyword', () => {
  for (const rule of SECRET_RULE_SOURCES) {
    assert.ok(rule.id.length > 0)
    assert.ok(rule.keywords.length > 0, `${rule.id} has no keywords`)
    assert.ok(rule.pattern.length > 0, `${rule.id} has no pattern`)
  }
})

test('keywords are lowercased, because the prefilter lowercases the haystack', () => {
  for (const rule of SECRET_RULE_SOURCES) {
    for (const word of rule.keywords) assert.equal(word, word.toLowerCase())
  }
})

test('ids are unique', () => {
  assert.equal(new Set(SECRET_RULE_SOURCES.map((rule) => rule.id)).size, SECRET_RULE_SOURCES.length)
})

test('every pattern compiles on the engine that will run it', () => {
  // The engine that runs them is JavaScript's, reached through `matcherFor`.
  // Checking against the Rust engine here would fail on patterns gitleaks
  // ships that Rust refuses — `{50,1000}` exceeds its DFA size limit — and
  // those are shipped verbatim precisely because JavaScript accepts them.
  for (const rule of SECRET_RULE_SOURCES) {
    assert.doesNotThrow(() => matcherFor(rule.pattern, rule.group), `${rule.id} does not compile`)
    for (const entry of rule.allowlist) {
      assert.doesNotThrow(() => matcherFor(entry, 0), `${rule.id} allowlist does not compile`)
    }
  }
})

test('the aws rule is present', () => {
  assert.ok(SECRET_RULE_SOURCES.some((rule) => rule.id === 'aws-access-token'))
})
