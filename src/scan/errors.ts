export class UntranslatableRuleError extends Error {
  readonly pattern: string

  constructor(pattern: string) {
    super(`no JavaScript translation preserves what this pattern matches: ${pattern}`)
    this.name = 'UntranslatableRuleError'
    this.pattern = pattern
  }
}
