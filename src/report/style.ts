/**
 * ANSI styling, written out rather than pulled from a package.
 *
 * The tool ships zero runtime dependencies, and that is a claim on the README
 * rather than an accident, so a colour library is not worth spending it on.
 *
 * Colour is dropped when output is not a terminal — piping to a file or into a
 * pipeline should produce plain text — and when `NO_COLOR` is set, which is the
 * conventional opt-out.
 */
const ESC = '['
const RESET = `${ESC}0m`

const enabled = process.stdout.isTTY === true && process.env.NO_COLOR === undefined

const wrap =
  (code: string) =>
  (text: string): string =>
    enabled ? `${ESC}${code}m${text}${RESET}` : text

export const bold = wrap('1')
export const dim = wrap('2')
export const red = wrap('31')
export const yellow = wrap('33')
export const green = wrap('32')
export const cyan = wrap('36')
