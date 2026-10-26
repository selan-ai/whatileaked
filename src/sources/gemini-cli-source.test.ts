import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GeminiCliSource } from '#sources/gemini-cli-source'
import { FileKind, type ScanFile } from '#sources/source'

const home = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-home-'))

async function discover(root: string): Promise<ScanFile[]> {
  const found: ScanFile[] = []
  for await (const file of new GeminiCliSource(root).discover()) found.push(file)
  return found
}

test('finds session and subagent chats under each project folder', async () => {
  const root = await home()
  const chats = join(root, '.gemini', 'tmp', 'billing-api', 'chats')
  await mkdir(join(chats, 'a1b2c3d4'), { recursive: true })
  await writeFile(
    join(chats, 'session-2026-10-20T09-14-a1b2c3d4.jsonl'),
    `${JSON.stringify({ sessionId: 'a1b2c3d4', projectHash: 'f00d', kind: 'main' })}\n` +
      `${JSON.stringify({ id: 'm1', type: 'user', content: [{ text: 'hello' }] })}\n`,
  )
  await writeFile(join(chats, 'a1b2c3d4', 'e5f6a7b8.jsonl'), '{"sessionId":"e5f6a7b8"}\n')

  const found = await discover(root)
  assert.equal(found.length, 2)
  for (const file of found) {
    assert.equal(file.source, 'gemini-cli')
    assert.equal(file.kind, FileKind.transcript)
    assert.equal(file.project, 'billing-api')
  }
})

test('finds sessions saved before the JSONL format', async () => {
  const root = await home()
  const chats = join(root, '.gemini', 'tmp', 'deploy-tool', 'chats')
  await mkdir(chats, { recursive: true })
  await writeFile(join(chats, 'session-2026-05-02T09-14-0badf00d.json'), '{"messages":[]}')

  const found = await discover(root)
  assert.deepEqual(
    found.map((file) => file.path),
    [join(chats, 'session-2026-05-02T09-14-0badf00d.json')],
  )
})

test('labels a folder still named by the legacy hash with the source name', async () => {
  const root = await home()
  const chats = join(root, '.gemini', 'tmp', 'ab'.repeat(32), 'chats')
  await mkdir(chats, { recursive: true })
  await writeFile(join(chats, 'session-x.jsonl'), '{}\n')

  const found = await discover(root)
  assert.equal(found[0]?.project, 'gemini-cli')
})

test('finds the global GEMINI.md and project memory as memory files', async () => {
  const root = await home()
  await mkdir(join(root, '.gemini', 'tmp', 'alpha', 'memory'), { recursive: true })
  await writeFile(join(root, '.gemini', 'GEMINI.md'), '# notes\n')
  await writeFile(join(root, '.gemini', 'tmp', 'alpha', 'memory', 'MEMORY.md'), '# memory\n')

  const found = await discover(root)
  assert.deepEqual(
    found.map((file) => [file.kind, file.project]),
    [
      [FileKind.memory, 'gemini-cli'],
      [FileKind.memory, 'alpha'],
    ],
  )
  assert.equal(found[0]?.path, join(await realpath(root), '.gemini', 'GEMINI.md'))
})

test('ignores files outside chats and memory', async () => {
  const root = await home()
  const project = join(root, '.gemini', 'tmp', 'alpha')
  await mkdir(project, { recursive: true })
  await writeFile(join(project, 'logs.json'), '[]')
  await writeFile(join(root, '.gemini', 'settings.json'), '{}')

  assert.deepEqual(await discover(root), [])
})
