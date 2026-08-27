import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aggregate } from '#report/aggregate'
import type { Finding } from '#report/finding'

const finding = (rule: string, fp: string, project: string): Finding => ({
  rule,
  fingerprint: fp,
  context: 'const KEY = ',
  source: 'claude-code',
  project,
  sessionId: 's1',
  file: '/tmp/s1.jsonl',
  entryIndex: 0,
})

test('counts total occurrences and distinct secrets separately', () => {
  const totals = aggregate([
    finding('aws', 'aaa', 'p1'),
    finding('aws', 'aaa', 'p2'),
    finding('aws', 'bbb', 'p1'),
  ])
  assert.equal(totals.length, 1)
  assert.equal(totals[0]?.total, 3)
  assert.equal(totals[0]?.distinct, 2)
})

test('collapses repeats of one secret in one project into a single site', () => {
  const totals = aggregate([
    finding('aws', 'aaa', 'p1'),
    finding('aws', 'aaa', 'p1'),
    finding('aws', 'aaa', 'p2'),
  ])
  assert.equal(totals[0]?.sites.length, 2)
  assert.equal(totals[0]?.sites[0]?.occurrences, 2)
  assert.equal(totals[0]?.distinct, 1)
})

test('a site remembers the earliest entry it appeared in', () => {
  const late = { ...finding('aws', 'aaa', 'p1'), entryIndex: 900 }
  const early = { ...finding('aws', 'aaa', 'p1'), entryIndex: 12 }
  const totals = aggregate([late, early])
  assert.equal(totals[0]?.sites[0]?.firstEntryIndex, 12)
})

test('orders by total descending so the worst rule reads first', () => {
  const totals = aggregate([
    finding('gh', 'g1', 'p1'),
    finding('aws', 'a1', 'p1'),
    finding('aws', 'a2', 'p1'),
  ])
  assert.deepEqual(
    totals.map((t) => t.rule),
    ['aws', 'gh'],
  )
})

test('empty in, empty out', () => {
  assert.deepEqual(aggregate([]), [])
})
