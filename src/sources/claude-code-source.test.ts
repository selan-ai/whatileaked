import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ClaudeCodeSource } from '#sources/claude-code-source'
import type { TranscriptFile } from '#sources/source'

const home = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-home-'))

async function discover(root: string): Promise<TranscriptFile[]> {
  const found: TranscriptFile[] = []
  for await (const file of new ClaudeCodeSource(root).discover()) found.push(file)
  return found
}

test('finds a session and takes the project from cwd', async () => {
  const root = await home()
  const dir = join(root, '.claude', 'projects', '-Users-t-Repositories-deploy-tool')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'abc-123.jsonl'),
    JSON.stringify({
      sessionId: 'abc-123',
      cwd: '/Users/t/Repositories/deploy-tool',
      type: 'user',
    }),
  )

  const found = await discover(root)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.project, 'deploy-tool')
  assert.equal(found[0]?.source, 'claude-code')
})

test('falls back to the filename when no entry carries a cwd', async () => {
  const root = await home()
  const dir = join(root, '.claude', 'projects', 'weird-slug')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'def-456.jsonl'), '{"type":"summary"}')

  const found = await discover(root)
  assert.equal(found[0]?.project, 'weird-slug')
})

test('ignores files that are not jsonl', async () => {
  const root = await home()
  const dir = join(root, '.claude', 'projects', 'slug')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'notes.md'), 'nothing here')

  assert.deepEqual(await discover(root), [])
})

test('yields nothing when the directory does not exist', async () => {
  assert.deepEqual(await discover(await home()), [])
})
