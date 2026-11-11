/**
 * Display formatting shared by every app. These were copy-pasted into four pages; the
 * copies had drifted, so this file is the single definition.
 *
 * Deliberately absent: the `esc()` HTML-escaper each legacy page carried. It existed only
 * because those pages built markup with innerHTML. React escapes interpolated values, so
 * an escaper here would be dead code at best and an invitation to build HTML strings at worst.
 */

/** SAP dates arrive as Edm.Date ("2026-03-14"); users read them as 14.03.2026. */
export function fmtDate(value: unknown): string {
  if (!value) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value)
}

/** "" for anything non-numeric, so an empty cell stays empty instead of showing NaN. */
export function fmtNum(value: unknown, fractionDigits = 2): string {
  if (value === undefined || value === null || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
}

/**
 * "01 New", or just the code when there is no text.
 *
 * Joined with a plain space, which is what the legacy consoles did. Not an em dash: the
 * dash is used deliberately elsewhere (bank code — bank name) and mixing the two changes
 * how every Type and Structure cell reads.
 */
export function codeText(code: unknown, text?: unknown): string {
  if (!code) return ''
  return text ? `${code} ${text}` : String(code)
}

/**
 * The forgiving contains-match the legacy filter boxes used: either side may contain the
 * other, so typing a full ticket number still matches a truncated display value.
 * An empty filter matches everything; a filled filter never matches an empty cell.
 */
export function looseMatch(filterValue: unknown, rowValue: unknown): boolean {
  if (!filterValue) return true
  if (rowValue === undefined || rowValue === null || rowValue === '') return false
  const f = String(filterValue).toLowerCase()
  const r = String(rowValue).toLowerCase()
  return r.includes(f) || f.includes(r)
}

/**
 * Runs tasks a few at a time. Kept for genuinely large fan-out (hundreds of rows), NOT as
 * the socket workaround the legacy pages needed: their runLimited(3) existed because the
 * old proxy.py spoke HTTP/1.0 with no keep-alive, so a handful of slow reads consumed the
 * browser's ~6 connections per origin. The gateway speaks HTTP/1.1, so that limit is gone.
 */
export async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit = 6,
): Promise<Array<PromiseSettledResult<T>>> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++
      const task = tasks[index]!
      try {
        results[index] = { status: 'fulfilled', value: await task() }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/** Number from a display string, tolerating thousands separators. Non-numeric becomes 0. */
export function toNum(value: unknown): number {
  const n = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const AMOUNT_MULTIPLIERS: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }

/**
 * Parses an amount that may carry a magnitude suffix: "2.5M" -> 2500000. Thousands separators
 * are ignored, so a value this function formatted can be parsed again unchanged.
 *
 * Returns null for anything unparseable, which callers must treat as a validation failure —
 * distinct from 0, which is a legitimate (if usually invalid) amount. An empty string is also
 * null; "is this field filled in" is the caller's question, not this function's.
 */
export function parseAmount(raw: unknown): number | null {
  const value = String(raw ?? '').replace(/,/g, '').trim()
  if (!value) return null
  const match = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([KMBT])?$/i)
  if (!match?.[1]) return null
  const number = Number(match[1])
  if (!Number.isFinite(number)) return null
  return number * (AMOUNT_MULTIPLIERS[(match[2] ?? '').toUpperCase()] ?? 1)
}

/** Groups digits for display in an amount input. Up to 2 decimals, no forced trailing zeros. */
export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Groups the integer part of what the user is typing, leaving a trailing "." or a magnitude
 * suffix alone so the field does not fight the keystroke that is still in progress.
 */
export function formatAmountWhileTyping(raw: string): string {
  const trimmed = raw.replace(/,/g, '').trim()
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*[kmbt]$/i.test(trimmed)) return trimmed.toUpperCase()

  let cleaned = /^[+-]?\d*\.?\d*$/.test(trimmed) ? trimmed : trimmed.replace(/[^\d.+-]/g, '')
  const sign = cleaned.startsWith('-') ? '-' : ''
  cleaned = cleaned.replace(/[+-]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  const parts = cleaned.split('.')
  parts[0] = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return sign + parts.join('.')
}
