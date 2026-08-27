import type { Finding, ScanStats } from '#report/finding'

export interface Reporter {
  report(findings: readonly Finding[], stats: ScanStats): void
}
