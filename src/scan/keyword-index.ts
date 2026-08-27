import type { CompiledRule } from '#scan/rule'

/**
 * Characters kept either side of a keyword hit.
 *
 * gitleaks patterns are bounded on both sides — the widest prefix any of them
 * carries is `[\w.-]{0,50}?` and the longest secret is a couple of hundred
 * characters — so a rule cannot match anything outside this window. 512 leaves
 * a wide margin over both.
 */
const WINDOW_CHARS = 512

export interface RuleWindow {
  rule: CompiledRule
  /** The slice of the line worth running `rule.pattern` over. */
  text: string
}

/**
 * Which rules are worth running, and over how little of the text.
 *
 * Two things dominated the original sweep, and this class removes both:
 *
 *   - Asking each of ~200 rules "is one of your keywords here?" independently
 *     meant ~700 separate passes over the text. One alternation walks it once
 *     however many rules exist.
 *   - Running a selected rule's pattern over a *whole* line cost ~0.7ms when
 *     that line held 100KB of file content, and transcripts are full of those.
 *     A keyword hit says where the candidate is; scanning a window around it
 *     rather than the whole line is what turns minutes into seconds.
 */
export class KeywordIndex {
  readonly #alternation: RegExp
  readonly #byKeyword: ReadonlyMap<string, readonly CompiledRule[]>

  constructor(rules: readonly CompiledRule[]) {
    const byKeyword = new Map<string, CompiledRule[]>()
    for (const rule of rules) {
      for (const word of rule.keywords) {
        const owners = byKeyword.get(word)
        if (owners) owners.push(rule)
        else byKeyword.set(word, [rule])
      }
    }

    this.#byKeyword = byKeyword
    this.#alternation = new RegExp(
      `(?:${[...byKeyword.keys()].map(escapeLiteral).join('|')})`,
      'gi',
    )
  }

  windows(text: string): readonly RuleWindow[] {
    this.#alternation.lastIndex = 0

    const spans = new Map<CompiledRule, { start: number; end: number }[]>()
    for (const hit of text.matchAll(this.#alternation)) {
      const at = hit.index
      const start = Math.max(0, at - WINDOW_CHARS)
      const end = Math.min(text.length, at + hit[0].length + WINDOW_CHARS)

      for (const rule of this.#byKeyword.get(hit[0].toLowerCase()) ?? []) {
        const existing = spans.get(rule)
        if (!existing) {
          spans.set(rule, [{ start, end }])
          continue
        }
        // Hits arrive in order, so only the last span can overlap this one.
        const last = existing[existing.length - 1]
        if (last && start <= last.end) last.end = Math.max(last.end, end)
        else existing.push({ start, end })
      }
    }

    const windows: RuleWindow[] = []
    for (const [rule, ranges] of spans) {
      for (const range of ranges) windows.push({ rule, text: text.slice(range.start, range.end) })
    }
    return windows
  }
}

function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]-]/g, '\\$&')
}
