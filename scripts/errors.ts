export class GitleaksFetchError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`gitleaks config fetch failed with status ${status}`)
    this.name = 'GitleaksFetchError'
    this.status = status
  }
}

export class RuleTranslationError extends Error {
  readonly ruleId: string
  readonly pattern: string

  constructor(ruleId: string, pattern: string) {
    super(`${ruleId} has no JavaScript translation that preserves what it matches: ${pattern}`)
    this.name = 'RuleTranslationError'
    this.ruleId = ruleId
    this.pattern = pattern
  }
}
