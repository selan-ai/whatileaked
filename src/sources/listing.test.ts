import assert from 'node:assert/strict'
import { mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FileExtension, listFiles, resolveFile } from '#sources/listing'

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

test('resolveFile returns a file, and null for a directory or a missing path', async () => {
  const root = await dir()
  const file = join(root, 'CLAUDE.md')
  await writeFile(file, '')

  assert.equal(await resolveFile(file), await realpath(file))
  assert.equal(await resolveFile(root), null)
  assert.equal(await resolveFile(join(root, 'missing.md')), null)
})

test('resolveFile follows a symlink to the file that actually holds the text', async () => {
  const root = await dir()
  const real = join(root, 'dotfiles-CLAUDE.md')
  const link = join(root, 'CLAUDE.md')
  await writeFile(real, '# real')
  await symlink(real, link)

  // Not the link's own path: wipe rewrites whatever this returns, and renaming
  // over the link would replace it with a regular file while leaving the
  // credential in the target.
  assert.equal(await resolveFile(link), await realpath(real))
})

test('resolveFile returns null for a dangling symlink', async () => {
  const root = await dir()
  const link = join(root, 'CLAUDE.md')
  await symlink(join(root, 'gone.md'), link)

  assert.equal(await resolveFile(link), null)
})
