/*
 * The rules of RFTBBB00's selection screen and log, as pure functions. The component only holds state.
 */
import { APPLICATIONS, DEFAULT_PACKAGE_SIZE, MSG_NAMES, MSG_ORDER, MT_DEFAULT_PACKAGE, MT_DEFAULT_PROCESSES, MT_MAX_PROCESSES, POSTING_RELEASED } from './data.ts'
import type { FieldErrors, Flow, Form, LogLine, Masters, MsgType, Option, Run, Sort, SortField, TableState } from './types.ts'

/* ------------------------------------------------------------------ dates */
export const pad2 = (n: number) => (n < 10 ? '0' : '') + n
export const formatDMY = (d: Date) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
export const dateToIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** DD-MM-YYYY (also . or / separators) -> a real calendar date, else null. */
export function parseDMY(str: string): Date | null {
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(String(str ?? '').trim())
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2]) - 1
  const y = Number(m[3])
  const dt = new Date(y, mo, d)
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? dt : null
}
export const dmyToIso = (s: string) => {
  const d = parseDMY(s)
  return d ? dateToIso(d) : ''
}
export const isoToDmy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export const formatAmount = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/* ------------------------------------------------------------------ selection screen */
/** Screen 1000's defaults (RFTBBB00_SEL): every application, due date today, Test Run, Post Operational Only. */
export function defaultForm(today: Date): Form {
  return {
    apps: { tx: true, tm: true, ti: true, ts: true, tf: true },
    bukrs: [], rfhaFrom: '', rfhaTo: '',
    sgsart: [], sfhaar: [], ranl: [], rldepo: [], posacc: [], kontrh: [], rportb: [], wzbetr: [], bkklas: [], fhazba: [],
    sign: '', dzterm: formatDMY(today), dbuchu: '', wzbetrFlag: false, releas: false,
    budat: '', monat: '', bldat: '', postda: true, test: true, mode: 'opval', pack: false, psize: DEFAULT_PACKAGE_SIZE,
    mtA: false, mtS: '', mtRg: '', mtNr: MT_DEFAULT_PROCESSES, mtPs: MT_DEFAULT_PACKAGE,
  }
}

/** MODIFY_SCREEN group PCK: package processing only without Test Run and with Post All Valuation Areas. */
export const packageAvailable = (f: Form) => !f.test && f.mode === 'allval'

/** The checks the page ran on Execute. */
export function validateForm(f: Form): FieldErrors {
  const e: FieldErrors = {}
  if (!Object.values(f.apps).some(Boolean)) e.apps = 'Select at least one application.'
  for (const key of ['dzterm', 'dbuchu', 'budat', 'bldat'] as const) {
    const v = f[key].trim()
    if (!v) {
      if (key === 'dzterm') e.dzterm = 'Due date is required.'
    } else if (!parseDMY(v)) e[key] = 'Enter a valid date (DD-MM-YYYY).'
  }
  if (f.monat !== '') {
    const mo = Number(f.monat)
    if (!/^\d{1,2}$/.test(f.monat) || mo < 1 || mo > 16) e.monat = 'Enter a posting period between 01 and 16.'
  }
  if (f.rfhaFrom && !/^\d+$/.test(f.rfhaFrom)) e.rfhaFrom = 'Numbers only.'
  if (f.rfhaTo && !/^\d+$/.test(f.rfhaTo)) e.rfhaTo = 'Numbers only.'
  if (/^\d+$/.test(f.rfhaFrom) && /^\d+$/.test(f.rfhaTo) && Number(f.rfhaTo) < Number(f.rfhaFrom)) e.rfhaTo = '"To" must not be lower than "From".'
  if (packageAvailable(f) && f.pack && (!/^\d{1,2}$/.test(f.psize) || Number(f.psize) < 1)) e.psize = 'Enter a package size of 1 to 99.'
  if (f.mtA) {
    const nr = Number(f.mtNr)
    if (!/^\d+$/.test(f.mtNr) || nr < 1 || nr > MT_MAX_PROCESSES) e.mtNr = `Enter 1 to ${MT_MAX_PROCESSES} processes.`
    if (!/^\d+$/.test(f.mtPs) || Number(f.mtPs) < 1) e.mtPs = 'Package size must be at least 1.'
  }
  return e
}

/* ------------------------------------------------------------------ the flows due for posting */
const noZeros = (v: string) => v.replace(/^0+/, '') || '0'
const inList = (list: string[], v: string) => !list.length || list.includes(v)

/**
 * RFTBBB00's selection of the flows to post, on VTBFHAPO: released for posting (SBEWEBE 1), due up to
 * the due date, and every select-option. Filters on the transaction header (product / transaction type,
 * counterparty, portfolio, security, depot, position account) can only be checked where a service
 * serves the header (FX deals); other flows are left out of such a filter and counted in `notes`.
 */
export function selectDueFlows(flows: readonly Flow[], f: Form): { flows: Flow[]; notes: string[] } {
  const apps = APPLICATIONS.filter((a) => f.apps[a.key]).map((a) => a.rantyp)
  const allApps = apps.length === APPLICATIONS.length
  const due = dmyToIso(f.dzterm)
  const postBy = dmyToIso(f.dbuchu)
  const headerFilter = [f.sgsart, f.sfhaar, f.kontrh, f.rportb].some((l) => l.length > 0)
  const securityFilter = [f.ranl, f.rldepo, f.posacc].some((l) => l.length > 0)
  let noHeader = 0
  let noApp = 0
  const out = flows.filter((x) => {
    if (x.postingStatus !== POSTING_RELEASED) return false
    if (!x.dueDate || (due && x.dueDate > due)) return false
    if (postBy && x.postingDate && x.postingDate > postBy) return false
    if (!inList(f.bukrs, x.bukrs)) return false
    if (f.rfhaFrom && Number(noZeros(x.rfha)) < Number(f.rfhaFrom)) return false
    if (f.rfhaTo && Number(noZeros(x.rfha)) > Number(f.rfhaTo)) return false
    if (!inList(f.wzbetr, x.currency)) return false
    if (!inList(f.fhazba, x.flowType)) return false
    if (!inList(f.bkklas, x.flowClass)) return false
    if (f.sign && x.sign !== f.sign) return false
    if (!allApps) {
      if (!x.contract) {
        noApp++
        return false
      }
      if (!apps.includes(x.contract)) return false
    }
    if (securityFilter) {
      noHeader++
      return false
    }
    if (headerFilter) {
      if (!x.headerKnown) {
        noHeader++
        return false
      }
      if (!inList(f.sgsart, x.productType) || !inList(f.sfhaar, x.transactionType) || !inList(f.kontrh, x.partner) || !inList(f.rportb, x.portfolio)) return false
    }
    return true
  })
  const notes: string[] = []
  if (noHeader)
    notes.push(
      `${noHeader} flow(s) left out: a product type, transaction type, counterparty, portfolio or securities filter needs the transaction header (VTBFHA), which a service serves only for FX deals.`,
    )
  if (noApp) notes.push(`${noApp} flow(s) left out: their flow type belongs to no single application, so the application filter cannot be checked.`)
  if (f.releas) notes.push('"Released Transactions Only" (VTBFHA release status) cannot be checked: no service serves it, so it was not applied.')
  return { flows: out, notes }
}

/* ------------------------------------------------------------------ labels */
const labelOf = (list: readonly Option[], code: string) => list.find((o) => o.v === code)?.t ?? code
export const productLabel = (m: Masters, code: string) => (code ? labelOf(m.productTypes, code) : '')
export const txnTypeLabel = (m: Masters, product: string, code: string) =>
  code ? (m.transactionTypes.find((t) => t.product === product && t.v === code)?.t ?? code) : ''
export const flowTypeLabel = (m: Masters, code: string) => (code ? labelOf(m.flowTypes, code) : '')
export const directionLabel = (code: string) => (code === '+' ? '+ Incoming' : code === '-' ? '− Outgoing' : '')

/** The read-only result of Execute while SAP has no posting service: one information line per due flow. */
export function previewLines(flows: readonly Flow[]): LogLine[] {
  return flows.map((x, i) => ({
    id: i + 1,
    type: 'I' as MsgType,
    typeName: MSG_NAMES.I,
    bukrs: x.bukrs,
    rfha: x.rfha,
    sgsart: x.productType,
    sfhaart: x.transactionType,
    sfhazba: x.flowType,
    dzterm: isoToDmy(x.dueDate),
    ssign: x.sign,
    belnr: '',
    gjahr: '',
    prkey: '',
    text: `Due for posting: ${formatAmount(x.amount)} ${x.currency} — not posted (preview)`,
    amount: x.amount,
    currency: x.currency,
    hasFlow: true,
    msgid: '',
    msgno: '',
  }))
}

/* ------------------------------------------------------------------ the log (screen 1010 list) */
export function lineHaystack(m: Masters, l: LogLine): string {
  return [
    l.typeName, l.bukrs, l.rfha, productLabel(m, l.sgsart), txnTypeLabel(m, l.sgsart, l.sfhaart), flowTypeLabel(m, l.sfhazba),
    l.dzterm, directionLabel(l.ssign), l.belnr, l.gjahr, l.prkey, l.text,
  ]
    .join(' ')
    .toLowerCase()
}

const sortValue = (l: LogLine, f: SortField): string => {
  if (f === 'dzKey') return l.dzterm ? dmyToIso(l.dzterm) : ''
  return String(l[f] ?? '')
}

export function filterSortLog(m: Masters, lines: readonly LogLine[], t: Pick<TableState, 'search' | 'typeFilter' | 'companyFilter' | 'sort'>): LogLine[] {
  const q = t.search.trim().toLowerCase()
  let list = lines.filter(
    (l) => (!t.typeFilter || l.type === t.typeFilter) && (!t.companyFilter || l.bukrs === t.companyFilter) && (!q || lineHaystack(m, l).includes(q)),
  )
  const field = t.sort.field
  if (field) {
    const dir = t.sort.dir === 'asc' ? 1 : -1
    list = list.slice().sort((a, b) => {
      const x = sortValue(a, field)
      const y = sortValue(b, field)
      if (x === y) return a.id - b.id
      if (!x) return 1
      if (!y) return -1
      return (x < y ? -1 : 1) * dir
    })
  }
  return list
}

export const nextSort = (s: Sort, field: SortField): Sort =>
  s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }

export function logKpis(lines: readonly LogLine[]): { deals: number; flows: number; warn: number; err: number } {
  return {
    deals: new Set(lines.map((l) => `${l.bukrs}/${l.rfha}`)).size,
    flows: lines.filter((l) => l.hasFlow).length,
    warn: lines.filter((l) => l.type === 'W').length,
    err: lines.filter((l) => l.type === 'E').length,
  }
}

/** The log's type and company filters offer only what the lines contain. */
export function logFilterOptions(lines: readonly LogLine[]): { types: MsgType[]; companies: string[] } {
  const types = MSG_ORDER.filter((t) => lines.some((l) => l.type === t))
  const companies = [...new Set(lines.map((l) => l.bukrs))].sort()
  return { types, companies }
}

export function pageOf<T>(list: readonly T[], page: number, size: number): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(1, page), pageCount)
  return { rows: list.slice((p - 1) * size, p * size), page: p, pageCount }
}

export const emptyRun = (): Run => ({ lines: [], test: true, preview: true, notes: [] })
