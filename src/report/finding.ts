import type { SourceName } from '#transcript/entry'

/** A match plus where it was found. No field can carry the secret. */
export interface Finding {
  rule: string
  fingerprint: string
  /** The masked text just before the secret — how a reader tells a live
   *  credential from a test fixture without opening the file. */
  context: string
  source: SourceName
  project: string
  sessionId: string
  file: string
  entryIndex: number
}

export interface ScanStats {
  transcripts: number
  entries: number
  /** Lines that were not valid JSON. */
  skipped: number
  /** Entries the engine refused. Surfaced rather than swallowed: a silent zero
   *  here would read as "nothing to find" when it means "not looked at". */
  unscannable: number
}
