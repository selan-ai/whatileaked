import assert from 'node:assert/strict'
import { mkdtemp, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { shorten } from '#report/paths'

const original = process.env.HOME

after(() => {
  process.env.HOME = original
})

test('abbreviates the home directory', () => {
  process.env.HOME = '/Users/t'
  assert.equal(shorten('/Users/t/.claude/CLAUDE.md'), '~/.claude/CLAUDE.md')
})

test('leaves a path outside the home directory alone', () => {
  process.env.HOME = '/Users/t'
  assert.equal(shorten('/etc/hosts'), '/etc/hosts')
})

test('abbreviates a resolved path when the home directory is itself a symlink', async () => {
  // `realpath` throughout: on macOS the temp root is itself reached through a
  // symlink, so an unresolved spelling here would compare two paths that differ
  // for a reason this test is not about.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'whatileaked-home-')))
  const link = join(root, 'home-link')
  await symlink(root, link)

  process.env.HOME = link

  // What an instruction file's path looks like after resolveFile: spelled with
  // the real directory, while $HOME still names the link. Without resolving,
  // this prints in full and puts a username in a screenshot.
  assert.equal(shorten(join(root, '.claude', 'CLAUDE.md')), '~/.claude/CLAUDE.md')
})
