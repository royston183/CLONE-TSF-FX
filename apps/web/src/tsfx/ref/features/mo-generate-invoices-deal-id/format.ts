import { STATUS_TEXT } from './data.ts'

export function money(v: number | undefined, decimals: number): string {
  const n = Number(v || 0)
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function statusText(code: string): string {
  return STATUS_TEXT[code] ?? code
}

export function validDMY(s: string): boolean {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s)
  if (!m) return false
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1])
}

export function parseNum(s: string): number {
  return Number(String(s).replace(/,/g, ''))
}

export function parseDMY(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

export function formatDMY(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}
