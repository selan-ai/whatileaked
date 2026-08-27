import { shannonEntropy } from '#scan/entropy'
import { type Matcher, matcherFor } from '#scan/matcher'

/** A rule as the generated file stores it: plain data, no engine objects, so
 *  importing the rule set compiles nothing. */
export interface SecretRuleSource {
  /** gitleaks rule id, e.g. "aws-access-token". */
  id: string
  /** Lowercased literals, one of which must appear before the pattern is worth
   *  running. Tested for every rule in one combined pass. */
  keywords: readonly string[]
  pattern: string
  /** Capture group holding the secret; 0 means the whole match. */
  group: number
  /** Minimum bits/char for a match to count, or 0 for no threshold. */
  entropy: number
  /** Values upstream says are not credentials. Omitting these flags AWS's own
   *  published example key. */
  allowlist: readonly string[]
}

interface Compiled {
  matcher: Matcher
  allowlist: readonly Matcher[]
}

/**
 * One rule, compiled the first time it is actually needed, and never rebuilt.
 *
 * Compiling every pattern up front costs address space that a WebAssembly
 * module never gives back, and most rules never fire — so compiling on first
 * use means a corpus that trips forty rules pays for forty.
 *
 * Never rebuilt for the same reason, which is worth stating because the
 * opposite was tried first: since freeing returns no address space, rebuilding
 * a pattern only raises the high-water mark. Measured over a 710MB sweep,
 * rebuilding every 8MB cost 1752MB peak, every 1MB cost 2774MB and twice the
 * wall time, and never rebuilding cost 1581MB. Recycling was strictly worse on
 * both axes.
 */
export class CompiledRule {
  readonly id: string
  readonly keywords: readonly string[]

  readonly #source: SecretRuleSource
  #compiled: Compiled | null = null

  constructor(source: SecretRuleSource) {
    this.id = source.id
    this.keywords = source.keywords
    this.#source = source
  }

  /** Every secret this rule finds in `text`, after its entropy threshold and
   *  its upstream allowlist have had their say. */
  secretsIn(text: string): readonly string[] {
    const { matcher, allowlist } = this.#compile()
    const secrets: string[] = []

    for (const secret of matcher.candidatesIn(text)) {
      if (this.#source.entropy > 0 && shannonEntropy(secret) < this.#source.entropy) continue
      if (allowlist.some((allowed) => allowed.matches(secret))) continue

      secrets.push(secret)
    }

    return secrets
  }

  #compile(): Compiled {
    const existing = this.#compiled
    if (existing) return existing

    const compiled: Compiled = {
      matcher: matcherFor(this.#source.pattern, this.#source.group),
      allowlist: this.#source.allowlist.map((entry) => matcherFor(entry, 0)),
    }
    this.#compiled = compiled
    return compiled
  }
}

export function compileRules(sources: readonly SecretRuleSource[]): readonly CompiledRule[] {
  return sources.map((source) => new CompiledRule(source))
}
