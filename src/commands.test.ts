import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Command, parseCommand } from '#commands'

test('no argument shows home, which introduces the destructive subcommand', () => {
  assert.equal(parseCommand([]), Command.home)
})

test('both real commands are recognised', () => {
  assert.equal(parseCommand(['scan']), Command.scan)
  assert.equal(parseCommand(['wipe']), Command.wipe)
})

test('anything else is refused rather than treated as a scan', () => {
  // Defaulting an unknown word to `scan` would be harmless, but defaulting a
  // typo'd `wipe` to anything is not a habit worth starting.
  assert.equal(parseCommand(['wipeall']), null)
  assert.equal(parseCommand(['--help']), null)
})
