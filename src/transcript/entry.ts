/** Closed set, but not a parsed one: these values are only ever constructed
 *  here, never read from a file or a request, so there is nothing to validate. */
export const SourceName = {
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
} as const

export type SourceName = (typeof SourceName)[keyof typeof SourceName]

/** One parsed jsonl line. The payload stays `unknown` because each source's
 *  schema owns its own shape and this reader owns none of them. The raw line
 *  travels with it so the scanner can work on the text as written, without
 *  rebuilding it from the parsed object. */
export interface TranscriptEntry {
  index: number
  payload: unknown
  line: string
}

export interface ReadStats {
  entries: number
  skipped: number
}
