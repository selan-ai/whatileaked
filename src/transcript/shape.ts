/**
 * Narrow the `unknown` a jsonl line parses to.
 *
 * Hand-written rather than a schema library, and that is a deliberate exception
 * rather than the house style: the shapes here are two objects of string
 * fields, and the package shipping zero dependencies is worth more to a tool
 * whose whole claim is that it sends nothing anywhere. Anything more elaborate
 * than this belongs in a schema.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringField(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' ? value : null
}

export function objectField(source: unknown, key: string): unknown {
  return isRecord(source) ? source[key] : null
}
