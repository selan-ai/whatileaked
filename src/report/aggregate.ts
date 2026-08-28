import type { Finding } from '#report/finding'
import type { FileKind } from '#sources/source'

/** One secret in one project. The unit a reader can act on: rotate this
 *  credential, and look in this session to see how it got there. */
export interface LeakSite {
  fingerprint: string
  kind: FileKind
  project: string
  /** The transcript to open. Printing it is the difference between "you have a
   *  leak" and "you can go look at it". */
  file: string
  /** Masked lead-in from the first place this secret was seen. */
  context: string
  occurrences: number
  /** The earliest position it appears at, so there is one concrete place to
   *  look rather than a list of hundreds. */
  firstAt: number
}

export interface RuleTotal {
  rule: string
  total: number
  distinct: number
  sites: readonly LeakSite[]
}

/** The scanner counts nothing; it reports matches. Counting lives here so
 *  "how many" and "of what kind" stay one decision in one place.
 *
 *  Collapsing to one row per secret-per-project is not cosmetic: a credential
 *  pasted into a long session appears hundreds of times, and a report that
 *  prints every occurrence buries the five secrets that matter under a
 *  thousand lines nobody reads. */
export function aggregate(findings: readonly Finding[]): readonly RuleTotal[] {
  const byRule = new Map<string, Map<string, LeakSite>>()
  const totals = new Map<string, number>()

  for (const finding of findings) {
    totals.set(finding.rule, (totals.get(finding.rule) ?? 0) + 1)

    const sites = byRule.get(finding.rule) ?? new Map<string, LeakSite>()
    byRule.set(finding.rule, sites)

    const key = `${finding.fingerprint}:${finding.project}`
    const site = sites.get(key)
    if (site) {
      site.occurrences++
      site.firstAt = Math.min(site.firstAt, finding.at)
      continue
    }

    sites.set(key, {
      fingerprint: finding.fingerprint,
      kind: finding.kind,
      project: finding.project,
      file: finding.file,
      context: finding.context,
      occurrences: 1,
      firstAt: finding.at,
    })
  }

  return [...byRule.entries()]
    .map(([rule, sites]) => ({
      rule,
      total: totals.get(rule) ?? 0,
      distinct: new Set([...sites.values()].map((site) => site.fingerprint)).size,
      sites: [...sites.values()].sort((a, b) => b.occurrences - a.occurrences),
    }))
    .sort((a, b) => b.total - a.total || a.rule.localeCompare(b.rule))
}
