/** What replaces a secret. Contains no character JSON escapes, so substituting
 *  it inside a string literal cannot invalidate the line it sat in. */
export function placeholder(rule: string): string {
  return `[REDACTED BY whatileaked: ${rule}]`
}

/**
 * Replace every secret in one raw jsonl line.
 *
 * Textual substitution rather than parse-and-reserialise: reserialising would
 * reorder keys and restyle the whole line, turning a one-secret edit into a
 * whole-file rewrite that no diff could be read. Credentials contain no
 * character JSON would escape, so the secret appears in the raw line exactly as
 * the scanner found it.
 */
export function redactLine(line: string, secrets: ReadonlyMap<string, string>): string {
  let redacted = line
  for (const [secret, rule] of secrets) {
    redacted = redacted.split(secret).join(placeholder(rule))
  }
  return redacted
}
