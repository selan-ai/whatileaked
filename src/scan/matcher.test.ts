import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RRegex } from 'rregex'
import { fakeBase32, fakeSecret } from '#scan/fake-secret'
import { matcherFor, translateToJavaScript } from '#scan/matcher'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'

test('a leading (?i) becomes the i flag', () => {
  const translated = translateToJavaScript('(?i)akia[a-z]{4}')
  assert.ok(translated)
  assert.equal(translated.flags, 'gi')
  assert.equal(translated.source, 'akia[a-z]{4}')
})

test('a pattern with no inline flag keeps its case sensitivity', () => {
  const translated = translateToJavaScript('AKIA[A-Z]{4}')
  assert.ok(translated)
  assert.equal(translated.flags, 'g')
})

test('a scoped (?i) is refused rather than approximated', () => {
  // `p8e-` is case-SENSITIVE here and only the tail is not. A blanket i flag
  // would match `P8E-`, which gitleaks does not.
  assert.equal(translateToJavaScript(String.raw`\b(p8e-(?i)[a-z0-9]{32})`), null)
})

test('a negated scope is refused too', () => {
  assert.equal(translateToJavaScript('(?i)abc(?-i:DEF)'), null)
})

test('both engines agree on every translatable rule', () => {
  const haystack = [
    `AWS_ACCESS_KEY_ID=AKIA${fakeBase32(11, 16)}`,
    `github_pat_${fakeSecret(12, 40)}`,
    `slack token xoxb-${fakeSecret(13, 24)}`,
    `-----BEGIN RSA PRIVATE KEY----- ${fakeSecret(14, 64)}`,
    `curl -u admin:${fakeSecret(15, 20)} https://example.com`,
    `Authorization: Bearer ${fakeSecret(16, 48)}`,
  ].join('\n')

  let compared = 0
  for (const rule of SECRET_RULE_SOURCES) {
    const translated = translateToJavaScript(rule.pattern)
    if (translated === null) continue

    // Patterns are shipped as gitleaks wrote them, and a couple are ones the
    // Rust engine itself refuses — `{50,1000}` over a wide class exceeds its
    // DFA size limit. Those cannot serve as a reference; JavaScript runs them
    // fine, which is why they ship unmodified.
    let reference: RRegex
    try {
      reference = new RRegex(rule.pattern)
    } catch {
      continue
    }
    compared++

    const viaJavaScript = [...matcherFor(rule.pattern, rule.group).candidatesIn(haystack)].sort()
    const viaRust = reference
      .capturesAll(haystack)
      .map((capture) => (capture.get[rule.group] ?? capture.get[0])?.value)
      .sort()

    assert.deepEqual(viaJavaScript, viaRust, `${rule.id} disagrees between engines`)
  }

  assert.ok(compared > 150, `only ${compared} rules were comparable`)
})

test('the rules the flag route refuses are folded instead, never dropped', () => {
  const refused = SECRET_RULE_SOURCES.filter((rule) => translateToJavaScript(rule.pattern) === null)
  assert.ok(refused.length > 0)
  for (const rule of refused) {
    assert.doesNotThrow(() => matcherFor(rule.pattern, rule.group).matches('probe'))
  }
})
