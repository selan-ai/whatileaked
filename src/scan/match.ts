/**
 * One kind of secret found in one string.
 *
 * There is deliberately no field here that could carry the secret. This object
 * is printed to a terminal and pasted into public forum threads.
 */
export interface Match {
  rule: string
  fingerprint: string
  /**
   * The text immediately before the secret, with every secret in that stretch
   * masked.
   *
   * This exists because a fingerprint alone cannot answer the only question a
   * reader has: is this real, or a fixture? `const SECOND_AWS_KEY = ***`
   * answers it at a glance. A preview of the secret itself would not — the
   * leading characters of an AWS key are `AKIA` whether it is live or invented
   * — and would put credential material into output meant for screenshots.
   */
  context: string
}
