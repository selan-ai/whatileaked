import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TranscriptReader } from '#transcript/reader'

async function fixture(lines: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'whatileaked-'))
  const path = join(dir, 'session.jsonl')
  await writeFile(path, lines.join('\n'))
  return path
}

async function collect(path: string): Promise<{ indices: number[]; skipped: number }> {
  const reader = new TranscriptReader()
  const indices: number[] = []
  for await (const entry of reader.read(path)) indices.push(entry.index)
  return { indices, skipped: reader.stats.skipped }
}

test('yields one entry per valid line, indexed from zero', async () => {
  const path = await fixture(['{"a":1}', '{"b":2}'])
  const { indices } = await collect(path)
  assert.deepEqual(indices, [0, 1])
})

test('skips invalid json and counts it rather than throwing', async () => {
  const path = await fixture(['{"a":1}', 'not json at all', '{"b":2}'])
  const { indices, skipped } = await collect(path)
  assert.deepEqual(indices, [0, 2])
  assert.equal(skipped, 1)
})

test('skips a truncated final line, which is what a killed session leaves', async () => {
  const path = await fixture(['{"a":1}', '{"b":'])
  const { skipped } = await collect(path)
  assert.equal(skipped, 1)
})

test('ignores blank lines without counting them as damage', async () => {
  const path = await fixture(['{"a":1}', '', '   ', '{"b":2}'])
  const { indices, skipped } = await collect(path)
  assert.deepEqual(indices, [0, 3])
  assert.equal(skipped, 0)
})

test('a missing file yields nothing rather than throwing', async () => {
  const { indices, skipped } = await collect('/nonexistent/session.jsonl')
  assert.deepEqual(indices, [])
  assert.equal(skipped, 0)
})
