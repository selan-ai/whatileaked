import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { type MemoryLine, readLines } from '#memory/reader'

const dir = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-memory-'))

async function lines(path: string): Promise<MemoryLine[]> {
  const found: MemoryLine[] = []
  for await (const line of readLines(path)) found.push(line)
  return found
}

test('numbers lines from one so they match an editor', async () => {
  const file = join(await dir(), 'CLAUDE.md')
  await writeFile(file, '# Title\nfirst\nsecond\n')

  assert.deepEqual(await lines(file), [
    { number: 1, text: '# Title' },
    { number: 2, text: 'first' },
    { number: 3, text: 'second' },
  ])
})

test('skips blank lines but still counts them', async () => {
  const file = join(await dir(), 'CLAUDE.md')
  await writeFile(file, '# Title\n\n   \nlast\n')

  assert.deepEqual(await lines(file), [
    { number: 1, text: '# Title' },
    { number: 4, text: 'last' },
  ])
})

test('yields nothing for a file that does not exist', async () => {
  assert.deepEqual(await lines(join(await dir(), 'missing.md')), [])
})
