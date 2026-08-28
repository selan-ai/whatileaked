import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CodexSource } from '#sources/codex-source'
import type { ScanFile } from '#sources/source'

const home = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-home-'))

async function discover(root: string): Promise<ScanFile[]> {
  const found: ScanFile[] = []
  for await (const file of new CodexSource(root).discover()) found.push(file)
  return found
}

test('reads session id and project from the session_meta line', async () => {
  const root = await home()
  const dir = join(root, '.codex', 'sessions', '2026', '03', '11')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'rollout-2026-03-11T18-35-06-019cddc0.jsonl'),
    JSON.stringify({
      type: 'session_meta',
      payload: { id: '019cddc0', cwd: '/Users/t/Repositories/data-pipeline' },
    }),
  )

  const found = await discover(root)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.project, 'data-pipeline')
  assert.equal(found[0]?.source, 'codex')
})

test('finds sessions nested at any depth under the year directories', async () => {
  const root = await home()
  const dir = join(root, '.codex', 'sessions', '2026', '08', '27')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'rollout-deep.jsonl'), '{"type":"event_msg","payload":{}}')

  const found = await discover(root)
  assert.equal(found.length, 1)
})

test('yields nothing when the directory does not exist', async () => {
  assert.deepEqual(await discover(await home()), [])
})
