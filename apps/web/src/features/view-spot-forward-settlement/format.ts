export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** DD-MM-YYYY text to a local date. */
export function parseDMY(s: string): Date {
  const p = s.split('-')
  return new Date(parseInt(p[2] ?? '', 10), parseInt(p[1] ?? '', 10) - 1, parseInt(p[0] ?? '', 10))
}

/** DD-MM-YYYY, as the page shows every date. */
export function fmtDMY(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function fmtAmt(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtRate(n: number): string {
  return Number(n).toFixed(4)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
