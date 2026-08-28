import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CursorSource } from '#sources/cursor-source'
import type { ScanFile } from '#sources/source'

const home = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-home-'))

async function discover(root: string): Promise<ScanFile[]> {
  const found: ScanFile[] = []
  for await (const file of new CursorSource(root).discover()) found.push(file)
  return found
}

/** Cursor names the directory after the workspace path with every `/` replaced
 *  by `-`, and drops the leading empty segment. */
const slugFor = (path: string): string => path.replace(/^\//, '').split('/').join('-')

async function plant(root: string, slug: string, session: string): Promise<string> {
  const dir = join(root, '.cursor', 'projects', slug, 'agent-transcripts', session)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${session}.jsonl`)
  await writeFile(path, JSON.stringify({ role: 'user', message: { content: 'hello' } }))
  return path
}

test('finds an agent transcript and takes the session id from the filename', async () => {
  const root = await home()
  const path = await plant(root, slugFor('/tmp/anywhere'), 'df42413d')

  const found = await discover(root)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.path, path)
  assert.equal(found[0]?.source, 'cursor')
})

test('resolves the slug back to a real directory and names the project after it', async () => {
  const root = await home()
  // A workspace whose own name contains a dash — the case a naive split breaks.
  const workspace = join(await home(), 'deploy-tool')
  await mkdir(workspace, { recursive: true })
  await plant(root, slugFor(workspace), 'abc123')

  const found = await discover(root)
  assert.equal(found[0]?.project, 'deploy-tool')
})

test('falls back to the slug when the workspace is gone', async () => {
  const root = await home()
  await plant(root, 'Users-nobody-Repositories-vanished', 'abc123')

  const found = await discover(root)
  assert.equal(found[0]?.project, 'Users-nobody-Repositories-vanished')
})

test('keeps a project directory that is not a path, like empty-window', async () => {
  const root = await home()
  await plant(root, 'empty-window', 'abc123')

  const found = await discover(root)
  assert.equal(found[0]?.project, 'empty-window')
})

test('ignores files that are not jsonl', async () => {
  const root = await home()
  const dir = join(root, '.cursor', 'projects', 'empty-window', 'agent-transcripts', 'abc')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'notes.md'), 'nothing here')

  assert.deepEqual(await discover(root), [])
})

test('ignores everything outside agent-transcripts', async () => {
  const root = await home()
  const dir = join(root, '.cursor', 'projects', 'empty-window', 'canvases', 'node_modules')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'stray.jsonl'), '{}')

  assert.deepEqual(await discover(root), [])
})

test('yields nothing when Cursor is not installed', async () => {
  assert.deepEqual(await discover(await home()), [])
})
