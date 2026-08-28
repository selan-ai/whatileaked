import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ClaudeCodeSource } from '#sources/claude-code-source'
import { FileKind, type ScanFile } from '#sources/source'

const home = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'whatileaked-home-'))

async function discover(root: string): Promise<ScanFile[]> {
  const found: ScanFile[] = []
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

test('tags a discovered transcript as a transcript', async () => {
  const root = await home()
  const dir = join(root, '.claude', 'projects', '-Users-t-Repositories-demo')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'abc-123.jsonl'),
    JSON.stringify({ sessionId: 'abc-123', cwd: '/Users/t/Repositories/demo', type: 'user' }),
  )

  const found = await discover(root)
  assert.equal(found[0]?.kind, FileKind.transcript)
})

test('finds subagent transcripts nested under a session', async () => {
  const root = await home()
  const session = join(root, '.claude', 'projects', '-Users-t-Repositories-demo')
  await mkdir(join(session, 'abc-123', 'subagents'), { recursive: true })

  const meta = { sessionId: 'abc-123', cwd: '/Users/t/Repositories/demo', type: 'user' }
  await writeFile(join(session, 'abc-123.jsonl'), JSON.stringify(meta))
  // A subagent gets the parent's context handed to it, so a credential pasted
  // into the session reaches this file too.
  await writeFile(
    join(session, 'abc-123', 'subagents', 'agent-a8aa52af.jsonl'),
    JSON.stringify({ ...meta, isSidechain: true }),
  )

  const found = await discover(root)
  assert.equal(found.length, 2)

  const paths = found.map((file) => file.path).sort()
  assert.match(paths[0] ?? '', /abc-123\.jsonl$/)
  assert.match(paths[1] ?? '', /subagents\/agent-a8aa52af\.jsonl$/)
  // The subagent file carries its own cwd, so it resolves the same project.
  assert.deepEqual([...new Set(found.map((file) => file.project))], ['demo'])
})

test('finds the global instruction file', async () => {
  const root = await home()
  await mkdir(join(root, '.claude'), { recursive: true })
  await writeFile(join(root, '.claude', 'CLAUDE.md'), '# instructions')

  const found = await discover(root)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.kind, FileKind.memory)
  assert.equal(found[0]?.project, 'claude-code')
})

test('finds project memory files at any depth and ignores non-markdown', async () => {
  const root = await home()
  const memory = join(root, '.claude', 'projects', 'slug', 'memory', 'nested')
  await mkdir(memory, { recursive: true })
  await writeFile(join(memory, 'a-fact.md'), 'a fact')
  await writeFile(join(root, '.claude', 'projects', 'slug', 'memory', 'notes.txt'), 'ignored')

  const found = await discover(root)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.kind, FileKind.memory)
  assert.equal(found[0]?.project, 'slug')
})

test('a memory file borrows the project name its sibling transcripts resolved', async () => {
  const root = await home()
  const dir = join(root, '.claude', 'projects', '-Users-t-Repositories-alpha')
  await mkdir(join(dir, 'memory'), { recursive: true })
  await writeFile(
    join(dir, 's1.jsonl'),
    JSON.stringify({ sessionId: 's1', cwd: '/Users/t/Repositories/alpha', type: 'user' }),
  )
  await writeFile(join(dir, 'memory', 'a-fact.md'), 'a fact')

  const found = await discover(root)
  const memory = found.filter((file) => file.kind === FileKind.memory)

  assert.equal(memory.length, 1)
  // Not the raw slug: the transcript beside it reports `alpha`, and one project
  // must not appear under two spellings in one report.
  assert.equal(memory[0]?.project, 'alpha')
})
