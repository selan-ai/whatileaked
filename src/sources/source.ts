import type { SourceName } from '#transcript/entry'

export interface TranscriptFile {
  source: SourceName
  path: string
  /** The working directory's basename — enough to find the session again, short
   *  enough to read in a terminal. */
  project: string
}

export interface Source {
  readonly name: SourceName
  discover(): AsyncIterable<TranscriptFile>
}
