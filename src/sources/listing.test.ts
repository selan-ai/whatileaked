import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FileExtension, isFile, listFiles } from '#sources/listing'

const dir = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-listing-'))

test('lists only files with the requested extension', async () => {
  const root = await dir()
  await writeFile(join(root, 'a.jsonl'), '')
  await writeFile(join(root, 'b.md'), '')
  await writeFile(join(root, 'c.txt'), '')

  assert.deepEqual(await listFiles(root, FileExtension.jsonl), ['a.jsonl'])
  assert.deepEqual(await listFiles(root, FileExtension.markdown), ['b.md'])
})

test('yields nothing for a directory that does not exist', async () => {
  assert.deepEqual(await listFiles(join(await dir(), 'nope'), FileExtension.markdown), [])
})

test('isFile is true for a file and false for a directory or a missing path', async () => {
  const root = await dir()
  const file = join(root, 'CLAUDE.md')
  await writeFile(file, '')

  assert.equal(await isFile(file), true)
  assert.equal(await isFile(root), false)
  assert.equal(await isFile(join(root, 'missing.md')), false)
})
