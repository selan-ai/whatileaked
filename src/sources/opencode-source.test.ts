import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { Progress } from '#report/progress'
import { TerminalReporter } from '#report/terminal-reporter'
import { fakeSecret } from '#scan/fake-secret'
import { KeywordIndex } from '#scan/keyword-index'
import { compileRules } from '#scan/rule'
import { Scanner } from '#scan/scanner'
import { SECRET_RULE_SOURCES } from '#scan/secret-rules'
import { ScanRun } from '#scan-run'
import { loadSqlite, OpencodeSource } from '#sources/opencode-source'
import { FileKind, type ScanFile } from '#sources/source'
import { CONFIRMATION } from '#wipe/confirm'
import { WipeRun } from '#wipe/wipe-run'

const sqlite = await loadSqlite()
const needsSqlite = { skip: sqlite === null ? 'node:sqlite is not available here' : false }

const scanner = (): Scanner => new Scanner(new KeywordIndex(compileRules(SECRET_RULE_SOURCES)))

/** The two tables read, laid out as opencode's migrations leave them. */
async function plant(
  token: string,
  where: readonly string[] = ['.local', 'share', 'opencode', 'opencode.db'],
): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-opencode-'))
  const path = join(root, ...where)
  await mkdir(dirname(path), { recursive: true })

  const db = new (sqlite as NonNullable<typeof sqlite>).DatabaseSync(path)
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, directory TEXT NOT NULL);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
      type TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL);
  `)
  db.prepare('INSERT INTO session_v2 VALUES (?, ?)').run('ses_1', '/Users/t/code/deploy-tool')
  db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?)').run(
    'msg_1',
    'ses_1',
    'user',
    1,
    JSON.stringify({ text: `deploy with GITHUB_TOKEN=ghp_${token}` }),
  )
  db.close()
  return { root, path }
}

async function scan(source: OpencodeSource): Promise<{ count: number; output: string }> {
  const lines: string[] = []
  const run = new ScanRun(
    [source],
    scanner(),
    new TerminalReporter((line) => lines.push(line)),
    new Progress(() => {}, false),
  )
  const count = await run.run()
  return { count, output: lines.join('\n') }
}

test('yields nothing when opencode is not installed', async () => {
  const found: ScanFile[] = []
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-opencode-'))
  for await (const file of new OpencodeSource(root).discover()) found.push(file)
  assert.deepEqual(found, [])
})

test('finds a database moved by XDG_DATA_HOME', needsSqlite, async () => {
  const token = fakeSecret(43, 36)
  const { root } = await plant(token, ['xdg', 'opencode', 'opencode.db'])

  const { count } = await scan(new OpencodeSource(root, join(root, 'xdg', 'opencode')))
  assert.equal(count, 1)
})

test('finds the database OPENCODE_DB names, whatever it is called', needsSqlite, async () => {
  const token = fakeSecret(44, 36)
  const { root, path } = await plant(token, ['work', 'agent.sqlite'])
  const dir = join(root, '.local', 'share', 'opencode')

  const found: ScanFile[] = []
  for await (const file of new OpencodeSource(root, dir, path).discover()) found.push(file)
  assert.deepEqual(
    found.map((file) => file.path),
    [path],
  )
  const { count } = await scan(new OpencodeSource(root, dir, path))
  assert.equal(count, 1)
})

test('reads a database once when OPENCODE_DB names one it already lists', needsSqlite, async () => {
  const { root, path } = await plant(fakeSecret(45, 36))

  const { count } = await scan(new OpencodeSource(root, undefined, path))
  assert.equal(count, 1)
})

test('finds a token in a stored message and names the session directory', needsSqlite, async () => {
  const token = fakeSecret(41, 36)
  const { root } = await plant(token)

  const { count, output } = await scan(new OpencodeSource(root))

  assert.equal(count, 1)
  assert.match(output, /github-pat/)
  assert.match(output, /deploy-tool/)
  assert.match(output, /opencode\.db/)
  assert.match(output, /1 credential sent to a model provider/)
  assert.ok(!output.includes(token))
})

test('finds a token in assistant output kept in session_part', needsSqlite, async () => {
  const token = fakeSecret(46, 36)
  const { root, path } = await plant(fakeSecret(47, 36))

  // opencode 2.2.5+ moves assistant parts out of the message row.
  const db = new (sqlite as NonNullable<typeof sqlite>).DatabaseSync(path)
  db.exec(`
    CREATE TABLE session_part (message_id TEXT NOT NULL, session_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL, type TEXT NOT NULL, call_id TEXT, data TEXT NOT NULL,
      PRIMARY KEY (message_id, ordinal));
  `)
  db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?)').run(
    'msg_2',
    'ses_1',
    'assistant',
    2,
    JSON.stringify({ content: [] }),
  )
  db.prepare('INSERT INTO session_part VALUES (?, ?, ?, ?, ?, ?)').run(
    'msg_2',
    'ses_1',
    0,
    'tool',
    'call_1',
    JSON.stringify({ state: { status: 'completed', output: `GITHUB_TOKEN=ghp_${token}` } }),
  )
  db.close()

  const { count, output } = await scan(new OpencodeSource(root))
  assert.equal(count, 2)
  assert.match(output, /deploy-tool/)
  assert.ok(!output.includes(token))
})

test('where node:sqlite is missing, says the database was not scanned', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whatileaked-opencode-'))
  await mkdir(join(root, '.local', 'share', 'opencode'), { recursive: true })
  await writeFile(join(root, '.local', 'share', 'opencode', 'opencode.db'), '')

  const source = new OpencodeSource(root, undefined, undefined, async () => null)
  const found: ScanFile[] = []
  for await (const file of source.discover()) found.push(file)
  assert.equal(found[0]?.kind, FileKind.transcript)
  assert.equal(found[0]?.messages, null)

  const { count, output } = await scan(source)
  assert.equal(count, 0)
  // Never a bare clean result: the database is named, and why it was skipped.
  assert.match(output, /Found .*opencode\.db but did not scan it: reading it needs Node 22\.13/)
})

test('wipe leaves the database alone and reports it', needsSqlite, async () => {
  const { root, path } = await plant(fakeSecret(42, 36))
  const before = await readFile(path)

  const prompt = { ask: async (): Promise<string> => CONFIRMATION }
  const outcome = await new WipeRun([new OpencodeSource(root)], scanner(), prompt, () => {}).run()

  assert.deepEqual(outcome.untouched, [path])
  assert.equal(outcome.filesRewritten, 0)
  assert.deepEqual(await readFile(path), before)
})
