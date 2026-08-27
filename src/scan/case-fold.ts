/**
 * Rewrites a Go regex so JavaScript's engine matches exactly the same strings.
 *
 * Two constructs stand between the two dialects:
 *
 *   - **Named groups.** Go writes `(?P<name>…)`, JavaScript `(?<name>…)`.
 *   - **Scoped case-insensitivity.** Go can turn `(?i)` on partway through a
 *     pattern, or scope it with `(?i:…)` and `(?-i:…)`. JavaScript has one `i`
 *     flag for the whole pattern and nothing finer.
 *
 * The second is why `p8e-(?i)[a-z0-9]{32}` cannot simply be given the `i` flag:
 * that would match `P8E-`, which gitleaks does not. So the flag is never used.
 * Instead each case-insensitive region is made explicitly case-tolerant —
 * `[a-z0-9]` becomes `[a-zA-Z0-9]`, a literal `k` becomes `[kK]` — which is the
 * same set of strings written a longer way.
 *
 * Anything this does not positively recognise returns null and stays on the
 * Rust engine. A rule that silently matched *slightly* differently would be
 * worse than one that costs some memory.
 */
export function foldToJavaScript(pattern: string): string | null {
  const out: string[] = []
  // One entry per open group; the last is the region being written now.
  const insensitive: boolean[] = [false]

  const current = (): boolean => insensitive[insensitive.length - 1] ?? false

  for (let i = 0; i < pattern.length; ) {
    const char = pattern[i]

    if (char === '\\') {
      const next = pattern[i + 1]
      if (next === undefined) return null
      // A class shorthand (\w, \d, \s, \b) already covers both cases; an
      // escaped punctuation has no case. Neither needs folding.
      out.push(char, next)
      i += 2
      continue
    }

    if (char === '[') {
      const end = classEnd(pattern, i)
      if (end === null) return null
      const body = pattern.slice(i, end + 1)
      out.push(current() ? foldClass(body) : body)
      i = end + 1
      continue
    }

    // `(?i)` with no colon: switches the enclosing region on from here.
    // Checked before the group branch, since it opens nothing.
    if (pattern.startsWith('(?i)', i)) {
      insensitive[insensitive.length - 1] = true
      i += 4
      continue
    }

    if (char === '(') {
      const opened = openGroup(pattern, i, current())
      if (opened === null) return null
      out.push(opened.text)
      insensitive.push(opened.insensitive)
      i += opened.consumed
      continue
    }

    if (char === ')') {
      if (insensitive.length === 1) return null
      insensitive.pop()
      out.push(char)
      i += 1
      continue
    }

    out.push(current() ? foldLiteral(char ?? '') : (char ?? ''))
    i += 1
  }

  if (insensitive.length !== 1) return null

  try {
    new RegExp(out.join(''), 'g')
  } catch {
    return null
  }
  return out.join('')
}

interface OpenedGroup {
  text: string
  insensitive: boolean
  consumed: number
}

function openGroup(pattern: string, at: number, inherited: boolean): OpenedGroup | null {
  if (pattern.startsWith('(?i:', at)) {
    return { text: '(?:', insensitive: true, consumed: 4 }
  }
  if (pattern.startsWith('(?-i:', at)) {
    return { text: '(?:', insensitive: false, consumed: 5 }
  }
  if (pattern.startsWith('(?:', at)) {
    return { text: '(?:', insensitive: inherited, consumed: 3 }
  }
  if (pattern.startsWith('(?P<', at)) {
    const close = pattern.indexOf('>', at)
    if (close === -1) return null
    const name = pattern.slice(at + 4, close)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null
    return { text: `(?<${name}>`, insensitive: inherited, consumed: close - at + 1 }
  }
  if (pattern.startsWith('(?<', at)) {
    const close = pattern.indexOf('>', at)
    if (close === -1) return null
    return { text: pattern.slice(at, close + 1), insensitive: inherited, consumed: close - at + 1 }
  }
  // Any other `(?…` is a construct this does not model — lookaround, flags it
  // has not been taught. Refuse rather than guess.
  if (pattern.startsWith('(?', at)) return null

  return { text: '(', insensitive: inherited, consumed: 1 }
}

/** Index of the `]` closing the class that starts at `at`. */
function classEnd(pattern: string, at: number): number | null {
  let i = at + 1
  if (pattern[i] === '^') i += 1
  // A `]` in first position is a literal, per both dialects.
  if (pattern[i] === ']') i += 1

  for (; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      i += 1
      continue
    }
    if (pattern[i] === ']') return i
  }
  return null
}

/** `[a-z0-9]` -> `[a-zA-Z0-9]`, `[abc]` -> `[abcABC]`. */
function foldClass(body: string): string {
  const inner = body.slice(1, -1)
  const negated = inner.startsWith('^')
  const items = negated ? inner.slice(1) : inner

  const additions: string[] = []
  for (let i = 0; i < items.length; i++) {
    if (items[i] === '\\') {
      i += 1
      continue
    }

    const char = items[i]
    const isRange = items[i + 1] === '-' && items[i + 2] !== undefined && items[i + 2] !== ']'
    if (isRange) {
      const from = char ?? ''
      const to = items[i + 2] ?? ''
      if (isAlpha(from) && isAlpha(to)) additions.push(`${flip(from)}-${flip(to)}`)
      i += 2
      continue
    }

    if (isAlpha(char ?? '')) additions.push(flip(char ?? ''))
  }

  if (additions.length === 0) return body
  // A negated class must exclude both cases, so the additions belong inside it
  // exactly as they do in a positive one.
  return `[${negated ? '^' : ''}${items}${additions.join('')}]`
}

function foldLiteral(char: string): string {
  return isAlpha(char) ? `[${char}${flip(char)}]` : char
}

function isAlpha(char: string): boolean {
  return /^[A-Za-z]$/.test(char)
}

function flip(char: string): string {
  return char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()
}
