import { createHash } from 'node:crypto'

/** Twelve hex characters — 48 bits, ample to correlate one credential across
 *  one machine's history, and pointless to attack when no plaintext exists
 *  anywhere to confirm a guess against. */
export function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12)
}
