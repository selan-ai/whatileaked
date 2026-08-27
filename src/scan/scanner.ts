import { fingerprint } from '#scan/fingerprint'
import type { KeywordIndex } from '#scan/keyword-index'
import type { Match } from '#scan/match'

/** A base64'd secret is invisible to every rule, and agent payloads are full of
 *  encoded blobs, so this is not a theoretical hole. */
const BASE64_RUN = /[A-Za-z0-9+/_-]{40,}={0,2}/g

/**
 * Characters handed to the engine at once.
 *
 * A transcript line can carry 144KB of file content, and matching a whole one
 * against the keyword alternation is far more expensive than matching the same
 * bytes in pieces. Chunking also bounds the cost of any single pathological
 * line.
 */
const CHUNK_CHARS = 16 * 1024

/**
 * Characters each chunk overlaps the next.
 *
 * A secret sitting across a chunk boundary would otherwise be split in half and
 * matched by nothing. This must exceed the longest secret plus the longest
 * context a rule looks back over; the widest gitleaks prefix is 50 characters
 * and the longest secret a couple of hundred, so 1024 is a wide margin.
 * Overlapping means a secret near a boundary is found twice, which costs
 * nothing — matches are deduplicated by rule and value.
 */
const OVERLAP_CHARS = 1024

export class Scanner {
  readonly #index: KeywordIndex

  constructor(index: KeywordIndex) {
    this.#index = index
  }

  scan(text: string): readonly Match[] {
    const found = new Map<string, Match>()

    for (const chunk of chunks(text)) {
      this.#collect(chunk, found)

      BASE64_RUN.lastIndex = 0
      for (const run of chunk.matchAll(BASE64_RUN)) {
        const decoded = decodeBase64(run[0])
        if (decoded !== null) this.#collect(decoded, found)
      }
    }

    return [...found.values()]
  }

  /**
   * The secret values themselves, mapped to the rule that found them.
   *
   * Every other path in this codebase is built so a secret cannot escape it.
   * This one exists because redaction has to know what string to replace, and
   * nothing else may call it: the result is held in memory long enough to
   * rewrite a line and is never printed, logged, stored or returned to a
   * reporter.
   */
  secretsOf(text: string): ReadonlyMap<string, string> {
    const secrets = new Map<string, string>()

    for (const chunk of chunks(text)) {
      for (const window of this.#index.windows(chunk)) {
        for (const secret of window.rule.secretsIn(window.text)) {
          secrets.set(secret, window.rule.id)
        }
      }

      // A secret inside a base64 blob does not appear in the text literally,
      // so there is no substring to replace — the whole run has to go. Missing
      // this made `wipe` leave behind exactly the findings `scan` kept
      // reporting, which is the worst possible outcome for a tool whose job is
      // to remove them.
      BASE64_RUN.lastIndex = 0
      for (const run of chunk.matchAll(BASE64_RUN)) {
        const decoded = decodeBase64(run[0])
        if (decoded === null) continue

        for (const window of this.#index.windows(decoded)) {
          const found = window.rule.secretsIn(window.text)
          if (found.length > 0) secrets.set(run[0], window.rule.id)
        }
      }
    }

    return secrets
  }

  #collect(text: string, found: Map<string, Match>): void {
    for (const window of this.#index.windows(text)) {
      const secrets = window.rule.secretsIn(window.text)

      for (const secret of secrets) {
        found.set(`${window.rule.id}:${secret}`, {
          rule: window.rule.id,
          fingerprint: fingerprint(secret),
          context: contextBefore(window.text, secret, secrets),
        })
      }
    }
  }
}

/** Overlapping slices of `text`, sized so no single match runs over a whole
 *  100KB line. */
function* chunks(text: string): Generator<string> {
  if (text.length === 0) return

  for (let offset = 0; offset < text.length; offset += CHUNK_CHARS) {
    yield text.slice(offset, Math.min(text.length, offset + CHUNK_CHARS + OVERLAP_CHARS))
  }
}

/** Characters of lead-in kept. Enough for a variable name or a sentence, short
 *  enough to read on one line. */
const CONTEXT_CHARS = 52

/**
 * What sat immediately before the secret, with every secret masked.
 *
 * All of them, not just this one: a window that held two credentials would
 * otherwise print the second one in full while masking the first.
 */
function contextBefore(text: string, secret: string, secrets: readonly string[]): string {
  const at = text.indexOf(secret)
  if (at === -1) return ''

  let lead = text.slice(Math.max(0, at - CONTEXT_CHARS), at)
  for (const other of secrets) lead = lead.split(other).join('***')

  return lead.replace(/\s+/g, ' ').trimStart()
}

function decodeBase64(run: string): string | null {
  const decoded = Buffer.from(run, 'base64').toString('utf8')
  // A blob that was not text round-trips into replacement characters; scanning
  // those wastes a pass and can only produce noise.
  return decoded.includes('�') ? null : decoded
}
