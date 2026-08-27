import { foldToJavaScript } from '#scan/case-fold'
import { UntranslatableRuleError } from '#scan/errors'

/** Finds candidate secrets in a piece of text, before any entropy threshold or
 *  allowlist has had a say. */
export interface Matcher {
  candidatesIn(text: string): readonly string[]
  matches(text: string): boolean
}

/**
 * A gitleaks pattern rewritten for JavaScript's engine, or null when it cannot
 * be rewritten without changing what it matches.
 *
 * gitleaks patterns are Go regexes and most carry `(?i)` at the very front,
 * which is exactly the `i` flag and nothing more. A few instead scope
 * case-insensitivity to part of the pattern — `p8e-(?i)[a-z0-9]{32}` keeps the
 * prefix case-*sensitive* — and JavaScript has no way to express that. Those
 * stay on the Rust engine rather than being approximated.
 */
export function translateToJavaScript(pattern: string): RegExp | null {
  const leading = pattern.startsWith('(?i)')
  const body = leading ? pattern.slice(4) : pattern

  if (body.includes('(?i)') || body.includes('(?-i')) return null

  try {
    return new RegExp(body, leading ? 'gi' : 'g')
  } catch {
    return null
  }
}

/**
 * The only engine at runtime.
 *
 * This started on `rregex`, the Rust regex crate compiled to WebAssembly, since
 * gitleaks patterns target Go's RE2 and compile there verbatim. That cost 1.8GB
 * of WebAssembly address space just to compile the rule set, against a hard 4GB
 * ceiling that is never given back, and a full sweep died two thirds through.
 *
 * Moving every rule here dropped a 710MB sweep from 29s to 16s and from 1581MB
 * peak to a few hundred, with byte-identical findings. Verified against the Rust
 * engine before the switch: 106,001 comparisons for the directly-translatable
 * rules and 12,775 for the folded ones, zero disagreements. `rregex` remains a
 * dev dependency so those differential tests still run against the reference.
 */
class JavaScriptMatcher implements Matcher {
  readonly #regex: RegExp
  readonly #group: number

  constructor(regex: RegExp, group: number) {
    this.#regex = regex
    this.#group = group
  }

  candidatesIn(text: string): readonly string[] {
    this.#regex.lastIndex = 0

    const candidates: string[] = []
    for (const match of text.matchAll(this.#regex)) {
      const value = match[this.#group] ?? match[0]
      if (value !== undefined) candidates.push(value)
    }
    return candidates
  }

  matches(text: string): boolean {
    this.#regex.lastIndex = 0
    return this.#regex.test(text)
  }
}

/**
 * Two ways to reach JavaScript's engine, tried cheapest first.
 *
 * `translateToJavaScript` handles the common shape — a pattern that is either
 * wholly case-insensitive or wholly not — with the `i` flag and no rewriting.
 * `foldToJavaScript` handles Go's scoped case-insensitivity by making each
 * region explicitly case-tolerant, which is longer but matches the same
 * strings.
 *
 * Neither working is a generator bug rather than a runtime condition:
 * `scripts/generate-secret-rules.ts` drops any rule it cannot translate, with
 * the reason recorded in the generated file's header. Throwing here means the
 * rule set and the translator have drifted apart.
 */
export function matcherFor(pattern: string, group: number): Matcher {
  const flagged = translateToJavaScript(pattern)
  if (flagged !== null) return new JavaScriptMatcher(flagged, group)

  const folded = foldToJavaScript(pattern)
  if (folded !== null) return new JavaScriptMatcher(new RegExp(folded, 'g'), group)

  throw new UntranslatableRuleError(pattern)
}
