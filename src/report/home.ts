import { bold, cyan, dim, green, red } from '#report/style'

/**
 * What a bare `whatileaked` prints.
 *
 * Scanning used to be the default. It is a menu now because `wipe` exists:
 * a tool with a destructive subcommand should say so up front rather than
 * leave someone to discover it, and a reader deciding whether to run this at
 * all is better served by four lines about what it does than by a scan they
 * did not ask for.
 */
export function home(): readonly string[] {
  return [
    `  ${dim('Built by Selan —')} ${cyan('selan.ai')} ${dim('— we redact these before they leave your machine.')}`,
    '',
    `  ${bold('whatileaked scan')}   ${dim('find credentials in your local transcripts')}`,
    `  ${bold('whatileaked wipe')}   ${dim('replace them with a placeholder')} ${red('(rewrites files)')}`,
    '',
    `  ${green('No network.')} ${dim('No telemetry. Nothing is written unless you run wipe.')}`,
    `  ${dim('Secrets are never printed — findings show a fingerprint, not the value.')}`,
  ]
}
