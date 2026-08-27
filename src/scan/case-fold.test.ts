import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RRegex } from 'rregex'
import { foldToJavaScript } from '#scan/case-fold'
import { fakeSecret } from '#scan/fake-secret'
import { translateToJavaScript } from '#scan/matcher'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'

const hex = (seed: number, length: number): string =>
  fakeSecret(seed, length).toLowerCase().replace(/[g-z]/g, 'a').slice(0, length)

test('a scoped region becomes explicitly case-tolerant, not a blanket flag', () => {
  assert.equal(foldToJavaScript('p8e-(?i)[a-z0-9]{4}'), 'p8e-[a-z0-9A-Z]{4}')
})

test('a literal inside a scoped region folds to a two-case class', () => {
  assert.equal(foldToJavaScript('(?i)ab'), '[aA][bB]')
})

test('a literal outside one is left alone', () => {
  assert.equal(foldToJavaScript('AB(?i)c'), 'AB[cC]')
})

test('a negated scope turns folding back off', () => {
  assert.equal(foldToJavaScript('(?i)a(?-i:B)c'), '[aA](?:B)[cC]')
})

test("go's named groups become javascript's", () => {
  assert.equal(foldToJavaScript('(?P<alg>xy)'), '(?<alg>xy)')
})

test('an unmodelled construct is refused rather than guessed at', () => {
  assert.equal(foldToJavaScript('(?=lookahead)'), null)
})

test('the case-sensitive prefix stays case-sensitive', () => {
  const folded = foldToJavaScript(String.raw`\b(p8e-(?i)[a-z0-9]{32})`)
  assert.ok(folded)
  const regex = new RegExp(folded, 'g')

  const body = fakeSecret(31, 32).toLowerCase()
  assert.ok(new RegExp(folded).test(`p8e-${body}`), 'lowercase prefix should match')
  assert.ok(!new RegExp(folded).test(`P8E-${body}`), 'uppercase prefix must not match')
  assert.ok(new RegExp(folded).test(`p8e-${body.toUpperCase()}`), 'body should be case-tolerant')
  regex.lastIndex = 0
})

test('a trailing literal inside the scoped region is case-tolerant too', () => {
  // FLWPUBK_TEST-(?i)[a-h0-9]{32}-X — the `(?i)` runs to the end, so `-x`
  // matches. Missing that is the easiest way to fold too little.
  const rule = SECRET_RULE_SOURCES.find((r) => r.id === 'flutterwave-public-key')
  assert.ok(rule)
  const folded = foldToJavaScript(rule.pattern)
  assert.ok(folded)

  const body = hex(32, 32)
  assert.ok(new RegExp(folded).test(`FLWPUBK_TEST-${body}-x`))
  assert.ok(new RegExp(folded).test(`FLWPUBK_TEST-${body}-X`))
  assert.ok(!new RegExp(folded).test(`flwpubk_test-${body}-X`))
})

test('every rule the plain translation refuses can be folded instead', () => {
  const refused = SECRET_RULE_SOURCES.filter((r) => translateToJavaScript(r.pattern) === null)
  assert.ok(refused.length > 20)
  for (const rule of refused) {
    assert.notEqual(foldToJavaScript(rule.pattern), null, `${rule.id} could not be folded`)
  }
})

test('folded rules agree with the rust engine on case-permuted inputs', () => {
  const refused = SECRET_RULE_SOURCES.filter((r) => translateToJavaScript(r.pattern) === null)

  const probes = [
    `p8e-${fakeSecret(41, 32)}`,
    `P8E-${fakeSecret(41, 32)}`,
    `LTAI${fakeSecret(42, 20)}`,
    `ltai${fakeSecret(42, 20)}`,
    `EZAK${fakeSecret(43, 54)}`,
    `ezak${fakeSecret(43, 54)}`,
    `dp.pt.${fakeSecret(44, 43)}`,
    `DP.PT.${fakeSecret(44, 43)}`,
    `lin_api_${fakeSecret(45, 40)}`,
    `LIN_API_${fakeSecret(45, 40)}`,
    `PMAK-${hex(46, 24)}-${hex(47, 34)}`,
    `pmak-${hex(46, 24)}-${hex(47, 34)}`,
    `SG.${fakeSecret(48, 66)}`,
    `sg.${fakeSecret(48, 66)}`,
    `FLWSECK_TEST-${hex(49, 12)}`,
    `curl -H "Authorization: Bearer ${fakeSecret(50, 40)}"`,
    `curl -H "authorization: bearer ${fakeSecret(50, 40)}"`,
    `okta api key = 00${fakeSecret(51, 40)}`,
    `OKTA_API_KEY = 00${fakeSecret(51, 40)}`,
  ]

  for (const rule of refused) {
    const folded = foldToJavaScript(rule.pattern)
    assert.ok(folded, `${rule.id} could not be folded`)

    const javascript = new RegExp(folded, 'g')
    const rust = new RRegex(rule.pattern)

    for (const probe of probes) {
      javascript.lastIndex = 0
      const viaJavaScript = [...probe.matchAll(javascript)].map((m) => m[rule.group] ?? m[0])
      const viaRust = rust
        .capturesAll(probe)
        .map((capture) => (capture.get[rule.group] ?? capture.get[0])?.value)

      assert.deepEqual(
        viaJavaScript,
        viaRust,
        `${rule.id} disagrees between engines on ${probe.slice(0, 40)}`,
      )
    }
  }
})
