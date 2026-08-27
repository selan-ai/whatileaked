import { main } from '#main'

try {
  const findings = await main(process.argv.slice(2))
  // Non-zero when something was found, so this is usable as a CI gate later
  // without changing its output.
  process.exit(findings > 0 ? 1 : 0)
} catch (error) {
  process.stderr.write(`whatileaked: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}
