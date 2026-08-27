import { createHash } from 'node:crypto'

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
/** AWS key bodies are base32: no 0, 1, 8 or 9. A fixture drawn from the wrong
 *  alphabet simply never matches, which reads as a scanner bug. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * A deterministic high-entropy run, built from a seed rather than committed.
 *
 * Committing strings that trip 200 credential rules means GitHub's own secret
 * scanning opens alerts on this repo, and it makes a tool that warns about
 * checked-in credentials look like exactly the thing it warns about.
 *
 * Hash-derived rather than a small linear congruential generator: several rules
 * carry an entropy threshold, and an LCG taken modulo the alphabet cycles short
 * enough on some seeds to fall under it. A fixture that fails the gate looks
 * exactly like a scanner that missed the key.
 */
export function fakeSecret(seed: number, length: number): string {
  return derive(seed, length, ALPHANUMERIC)
}

export function fakeBase32(seed: number, length: number): string {
  return derive(seed, length, BASE32)
}

function derive(seed: number, length: number, alphabet: string): string {
  let out = ''
  let round = 0

  while (out.length < length) {
    const bytes = createHash('sha256').update(`whatileaked:${seed}:${round}`).digest()
    for (const byte of bytes) {
      if (out.length === length) break
      out += alphabet[byte % alphabet.length]
    }
    round++
  }

  return out
}
