import type { SourceName } from '#transcript/entry'

/** Closed set, constructed here and never parsed — the same reasoning the
 *  comment on `SourceName` gives. A transcript is a record of what was sent; a
 *  memory file is an instruction the agent loads before sending anything. */
export const FileKind = { transcript: 'transcript', memory: 'memory' } as const

export type FileKind = (typeof FileKind)[keyof typeof FileKind]

/** One message read out of a database, with the project its session ran in. */
export interface StoredMessage {
  project: string
  text: string
}

export interface ScanFile {
  source: SourceName
  kind: FileKind
  path: string
  /** The working directory's basename for a transcript, the directory slug for
   *  a project memory file, the source name for a global instruction file. */
  project: string
  /** Set only for a database: its messages, or null when this Node cannot open
   *  it. A file read as lines leaves it out. */
  messages?: (() => AsyncIterable<StoredMessage>) | null
}

export interface Source {
  readonly name: SourceName
  discover(): AsyncIterable<ScanFile>
}
