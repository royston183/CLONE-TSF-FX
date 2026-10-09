import {
  AS_OF,
  COLUMN_CATALOG,
  DEFAULTS,
  GET_DATA,
  LAYOUT_VARIANTS,
  LETTER_REG,
  NOTHING_POSTED,
  TXN_STATUS_CLASS,
  UNKNOWN_STATUS_CLASS,
  WAITING_ACTION,
  WAITING_API,
} from './data.ts'
import { dateToIso, formatAmount, formatRate, formatSwap, isoToDmy, padLeft, pad2, parseDateInput } from './format.ts'
import type {
  ActionName,
  BankAddress,
  CalendarCell,
  CalendarView,
  ColumnKey,
  CompanyOption,
  Criteria,
  CriteriaError,
  DateErr,
  Deal,
  DropdownItem,
  LayoutVariant,
  LetterModel,
  RunResult,
  RunView,
  Sort,
} from './types.ts'

/* ------------------------------------------------------------------ lookups */
export function findLayout(id: string): LayoutVariant {
  return LAYOUT_VARIANTS.find((l) => l.id === id) ?? LAYOUT_VARIANTS[0]!
}

/* ------------------------------------------------------------------ GET_DATA */
/** ZSGTSFV_FX has no single key: BUKRS + RFHA + REFNR identify a row. */
export function rowId(r: Pick<Deal, 'bukrs' | 'rfha'> & { refnr?: string }): string {
  return `${r.bukrs}|${r.rfha}|${r.refnr ?? ''}`
}

/** VTBFHA-RFHA is CHAR 13 with ALPHA conversion: a typed number is compared with its leading zeros. */
export function alphaRfha(input: string): string {
  const v = input.trim()
  return /^\d+$/.test(v) && v.length < 13 ? padLeft(v, 13, '0') : v.toUpperCase()
}

/**
 * S_RFHA as one select-option line: EQ, or CP when the value holds * or + (case-blind, as CP is).
 * Empty selects everything.
 */
export function rfhaMatches(rfha: string, input: string): boolean {
  const v = input.trim()
  if (!v) return true
  if (/[*+]/.test(v)) {
    const re = new RegExp(`^${v.replace(/[.^$|?(){}[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\+/g, '.')}$`, 'i')
    return re.test(rfha)
  }
  // ALPHA: numbers compare without their leading zeros
  if (/^\d+$/.test(v) && /^\d+$/.test(rfha)) return rfha.replace(/^0+/, '') === v.replace(/^0+/, '')
  return rfha.toUpperCase() === alphaRfha(v)
}

/**
 * FORM GET_DATA on ZSGTSFV_FX rows: the WHERE clause, then the report's own DELETEs. Since
 * sgsart = '12D' and the last DELETE drops every 'xxD' row with txn_status <> '13', only status 13
 * survives. FI_DOC is attached by the caller (BKPF; currently no API).
 */
export function getData(rows: readonly Deal[], c: Criteria): Deal[] {
  const from = c.dateFrom
  const to = c.dateTo || c.dateFrom // S_DATE without HIGH behaves as EQ
  return rows
    .filter(
      (r) =>
        c.bukrs.includes(r.bukrs) && // bukrs IN s_bukrs
        r.sgsart === GET_DATA.sgsart && // sgsart = '12D'
        rfhaMatches(r.rfha, c.rfha) && // rfha IN s_rfha
        r.delfz >= from &&
        r.delfz <= to && // delfz IN s_date
        r.saktiv !== GET_DATA.saktivExcluded, // saktiv <> 3
    )
    .filter((r) => !(r.txn_status < GET_DATA.minStatus)) // DELETE txn_status < '07'
    .filter((r) => r.txn_status !== GET_DATA.droppedStatus) // DELETE txn_status = '08'
    .filter((r) => !(r.sgsart.charAt(2) === GET_DATA.ndfMarker && r.txn_status !== GET_DATA.ndfStatus))
    .map((r) => ({ ...r }))
}

/* ------------------------------------------------------------------ validation */
/** Obligatory select-options: Company Code and Value Date From, plus a well-formed range. */
export function validateCriteria(criteria: Criteria, dateErr: DateErr): CriteriaError[] {
  const errs: CriteriaError[] = []
  if (!criteria.bukrs.length) errs.push({ key: 'bukrs', msg: 'Company Code is required.' })
  if (dateErr.from) errs.push({ key: 'dateFrom', msg: 'Value Date From: enter a valid date (dd-mm-yyyy).' })
  else if (!criteria.dateFrom) errs.push({ key: 'dateFrom', msg: 'Value Date From is required.' })
  if (dateErr.to) errs.push({ key: 'dateTo', msg: 'Value Date To: enter a valid date (dd-mm-yyyy).' })
  if (criteria.dateFrom && criteria.dateTo && criteria.dateFrom > criteria.dateTo)
    errs.push({ key: 'dateTo', msg: 'Value Date: "From" must not be later than "To".' })
  return errs
}

export function defaultCriteria(): Criteria {
  return { bukrs: [...DEFAULTS.bukrs], dateFrom: DEFAULTS.dateFrom, dateTo: DEFAULTS.dateTo, rfha: DEFAULTS.rfha }
}

/** What committing a date field's text does to the criteria. */
export type TypedDate =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: 'set'; iso: string; text: string | null }
  | { kind: 'error' }

/** A date field's text: while typing it only commits a complete valid date; on blur / Enter it also flags bad text. */
export function commitTypedDate(raw: string, final: boolean): TypedDate {
  if (!raw.replace(/\s/g, '')) return { kind: 'clear' }
  const iso = parseDateInput(raw)
  if (iso) return { kind: 'set', iso, text: final ? isoToDmy(iso) : null }
  return final ? { kind: 'error' } : { kind: 'none' }
}

/* ------------------------------------------------------------------ company multi-select */
/** Ticks or unticks one company; the list keeps the panel's (T001) order. */
export function toggleCompany(selected: string[], code: string, on: boolean, companies: readonly CompanyOption[]): string[] {
  const rest = selected.filter((c) => c !== code)
  if (!on) return rest
  return companies.map((c) => c.code).filter((c) => c === code || rest.includes(c))
}

export function allCompanies(companies: readonly CompanyOption[]): string[] {
  return companies.map((c) => c.code)
}

/** The trigger's text: null when nothing is selected (the placeholder shows). */
export function companySummary(selected: string[], companies: readonly CompanyOption[]): string | null {
  if (!selected.length) return null
  if (companies.length && selected.length === companies.length) return `All (${selected.length})`
  const order = companies.map((c) => c.code)
  return [...selected].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(', ')
}

/** "<code> - <name>" of a T001 entry. */
export function companyLabel(c: CompanyOption): string {
  return c.name ? `${c.code} - ${c.name}` : c.code
}

/* ------------------------------------------------------------------ table */
/** The ALV shows the TXN_STATUS code itself (no status text table is read by the report). */
export function statusText(code: string): string {
  return code
}

export function statusClass(code: string): string {
  return TXN_STATUS_CLASS[code] ?? UNKNOWN_STATUS_CLASS
}

/** The text a cell shows (and the search matches). */
export function cellValue(key: ColumnKey, row: Deal): string {
  const col = COLUMN_CATALOG[key]
  const v = row[key]
  if (key === 'txn_status') return statusText(String(v))
  if (key === 'fi_doc') return String(v || '')
  // Not served by SAP yet (FxTransaction settlement fields): blank, not a zero that reads like an amount.
  if ((key === 'ndf_rate' || key === 'zcash_amt' || key === 'cash_curr') && !row.settlement_known) return ''
  if (col.type === 'date') return isoToDmy(String(v))
  if (col.type === 'amount') return formatAmount(Number(v))
  if (col.type === 'rate') return key === 'oswap' ? formatSwap(Number(v)) : formatRate(Number(v))
  return v === undefined || v === null ? '' : String(v)
}

export function isNumericColumn(key: ColumnKey): boolean {
  const t = COLUMN_CATALOG[key].type
  return t === 'amount' || t === 'rate'
}

/** Cell CSS classes of the body (the header only uses num / sticky-b / sorted). */
export function cellClasses(key: ColumnKey): string[] {
  const t = COLUMN_CATALOG[key].type
  const cls: string[] = []
  if (t === 'amount' || t === 'rate') cls.push('num', 'mono')
  else if (t === 'date' || key === 'rfha' || key === 'fi_doc' || key === 'kontrh') cls.push('mono')
  if (key === 'rfha') cls.push('sticky-b')
  return cls
}

export function sortValue(key: ColumnKey, row: Deal): string | number {
  const col = COLUMN_CATALOG[key]
  const v = row[key]
  if (col.type === 'amount' || col.type === 'rate') return Number(v)
  if (col.type === 'date') return String(v || '')
  return String(key === 'fi_doc' || key === 'txn_status' ? v : cellValue(key, row)).toLowerCase()
}

/** Search across every column of the layout (all terms must match), then the sort. */
export function getVisibleRows(rows: Deal[], layoutId: string, search: string, sort: Sort): Deal[] {
  const cols = findLayout(layoutId).cols
  let list = rows.slice()
  const q = search.trim().toLowerCase()
  if (q) {
    const terms = q.split(/\s+/)
    list = list.filter((r) => {
      const hay = cols
        .map((k) => cellValue(k, r))
        .join(' | ')
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }
  if (sort.field) {
    const f = sort.field
    const dir = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const x = sortValue(f, a)
      const y = sortValue(f, b)
      if (x < y) return -1 * dir
      if (x > y) return 1 * dir
      return 0
    })
  }
  return list
}

/** Header click: the same column flips direction, another starts ascending. */
export function nextSort(sort: Sort, key: ColumnKey): Sort {
  if (sort.field === key) return { field: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field: key, dir: 'asc' }
}

export const NO_SORT: Sort = { field: null, dir: 'asc' }

export function sortMark(sort: Sort, key: ColumnKey): string {
  if (sort.field !== key) return ''
  return sort.dir === 'asc' ? '▲' : '▼'
}

export type PageView = {
  rows: Deal[]
  page: number
  pageCount: number
  total: number
  text: string
}

/** The current page; a page beyond the end is pulled back to the last one. */
export function pageSlice(list: Deal[], page: number, pageSize: number): PageView {
  const total = list.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(page, pageCount)
  const start = (cur - 1) * pageSize
  const rows = list.slice(start, start + pageSize)
  const text = total ? `Showing ${start + 1}–${start + rows.length} of ${total}` : 'Showing 0 of 0'
  return { rows, page: cur, pageCount, total, text }
}

/** The empty-state text; `unavailable` is the reason the deals could not be read (WAITING FOR API …). */
export function emptyText(hasErrors: boolean, search: string, unavailable: string | null = null, loading = false): string {
  if (hasErrors) return 'Complete the required selection criteria to list NDF deals.'
  if (unavailable) return unavailable
  if (loading) return 'Loading NDF deals from SAP…'
  return search ? 'No NDF deals match your search.' : 'No NDF deals match the current selection.'
}

/* ------------------------------------------------------------------ value helps */
/** Transaction No value help: the deals GET_DATA lists for the company / dates (S_RFHA left open). */
export function rfhaItems(base: readonly Deal[], criteria: Criteria, hasBukrsError: boolean, filter: string): DropdownItem[] {
  if (hasBukrsError || !criteria.dateFrom) return []
  const seen = new Set<string>()
  const f = String(filter || '').toLowerCase()
  return getData(base, { ...criteria, rfha: '' })
    .filter((r) => !seen.has(`${r.bukrs}|${r.rfha}`) && !!seen.add(`${r.bukrs}|${r.rfha}`))
    .filter((r) => !f || r.rfha.toLowerCase().includes(f) || r.bp_name.toLowerCase().includes(f))
    .map((r) => ({
      value: r.rfha,
      primary: r.rfha,
      secondary: `${r.bukrs} · ${r.bp_name}`,
      selected: r.rfha === criteria.rfha,
    }))
}

export function layoutItems(layoutId: string): DropdownItem[] {
  return LAYOUT_VARIANTS.map((l) => ({ value: l.id, primary: l.id, secondary: l.text, selected: l.id === layoutId }))
}

/* ------------------------------------------------------------------ calendar */
export function calendarYears(first: number, last: number, view: number): number[] {
  const years: number[] = []
  for (let y = first; y <= last; y++) years.push(y)
  // A date typed outside the selectable years still needs a matching option.
  if (!years.includes(view)) years.push(view)
  return years.sort((a, b) => a - b)
}

export function shiftMonth(view: CalendarView, by: number): CalendarView {
  const d = new Date(view.y, view.m + by, 1)
  return { y: d.getFullYear(), m: d.getMonth() }
}

/** The month shown when the calendar opens: the field's date, else today. */
export function viewForDate(iso: string): CalendarView {
  const [y = '', m = ''] = (iso || AS_OF).split('-')
  return { y: +y, m: +m - 1 }
}

/** The grid: leading days of the previous month, the month, trailing days of the next, up to full weeks. */
export function calendarCells(view: CalendarView, selectedIso: string, todayIso: string): CalendarCell[] {
  const startOffset = new Date(view.y, view.m, 1).getDay()
  const dim = new Date(view.y, view.m + 1, 0).getDate()
  const dpm = new Date(view.y, view.m, 0).getDate()
  const cells: CalendarCell[] = []
  for (let i = 0; i < startOffset; i++) {
    const day = dpm - startOffset + 1 + i
    cells.push({ iso: dateToIso(new Date(view.y, view.m - 1, day)), day, muted: true, selected: false, today: false })
  }
  for (let d = 1; d <= dim; d++) {
    const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(d)}`
    cells.push({ iso, day: d, muted: false, selected: iso === selectedIso, today: iso === todayIso })
  }
  const trailing = (7 - ((startOffset + dim) % 7)) % 7
  for (let i = 1; i <= trailing; i++) {
    cells.push({ iso: dateToIso(new Date(view.y, view.m + 1, i)), day: i, muted: true, selected: false, today: false })
  }
  return cells
}

/* ------------------------------------------------------------------ actions */
/** Why the posting buttons are disabled: RFTBBB00 (TBB1) is not exposed until the service declares PostSettlement. */
export const POSTING_WAITING =
  `${WAITING_ACTION} — the TBB1 posting run (SUBMIT RFTBBB00, then TXN_STATUS 50) needs the PostSettlement action on ` +
  `ZFS_SD_TRMFX (docs/abap/ZFS_SD_TRMFX-NdfSettlement.md). ${NOTHING_POSTED}`

export function runSummary(results: RunResult[]): { would: number; posted: number; already: number } {
  return {
    would: results.filter((r) => r.result === 'Would be posted').length,
    posted: results.filter((r) => r.result === 'Posted').length,
    already: results.filter((r) => r.result === 'Already posted').length,
  }
}

const singleParams = (row: Deal, mode: string): [string, string][] => [
  ['Company Code', row.bukrs],
  ['Transaction No', row.rfha],
  ['Key Date (Value Date)', isoToDmy(row.delfz)],
  ['Run mode', mode],
]

/** The parameters of a single-deal run (TEST p_test = 'X', TBB1 p_test = ''). */
export function singleRunParams(row: Deal, testRun: boolean): [string, string][] {
  return singleParams(row, testRun ? 'Test run – no update' : 'Update run')
}

/** FORM all_posting: every deal in the selection, key date s_date-high. */
export function postAllParams(deals: readonly Deal[], criteria: Criteria, keyDate: string): [string, string][] {
  return [
    ['Company Code', [...new Set(deals.map((d) => d.bukrs))].join(', ') || criteria.bukrs.join(', ')],
    ['Value Date', isoToDmy(criteria.dateFrom) + (criteria.dateTo ? ` to ${isoToDmy(criteria.dateTo)}` : '')],
    ['Key Date', isoToDmy(keyDate)],
    ['Run mode', `Update run – ${deals.length} deal(s) in selection`],
  ]
}

/** A run modal while PostSettlement is missing: the parameters and why nothing was posted. */
export function postingWaitingView(title: string, params: [string, string][]): RunView {
  return { title, params, results: [], notes: POSTING_WAITING }
}

/** One deal's outcome of a posting run. */
export type PostingLine = { row: Deal; keyDate: string; ok: boolean; fiDoc: string; message: string }

export function runResult(line: PostingLine, testRun: boolean): RunResult {
  const base = { bukrs: line.row.bukrs, rfha: line.row.rfha, keyDate: line.keyDate }
  if (!line.ok) return { ...base, result: 'Refused', cls: 'res-warn', fiDoc: '' }
  return testRun ? { ...base, result: 'Would be posted', cls: 'res-info', fiDoc: '' } : { ...base, result: 'Posted', cls: 'res-ok', fiDoc: line.fiDoc }
}

/** The run modal for real results: one line per deal, SAP's messages in the notes. */
export function postingResultView(title: string, params: [string, string][], lines: PostingLine[], testRun: boolean): RunView {
  return {
    title,
    params,
    results: lines.map((l) => runResult(l, testRun)),
    notes: lines.map((l) => `${l.row.rfha}: ${l.message}`).join('\n'),
  }
}

/** FORM all_posting passes p_dzterm = s_date-high (initial when only a From date is given). */
export function keyDateOf(criteria: Criteria): string {
  return criteria.dateTo
}

export function actionLabel(name: ActionName): string {
  return { preview: 'Preview Document', pdf: 'PDF', test: 'TBB1 Test Run', post: 'TBB1 Post' }[name]
}

/* ------------------------------------------------------------------ bank settlement letter (screen 9001) */
/**
 * go_obj_data->get_data: the account lines come from the deal's standing instructions (VTBSTC1, payment
 * types FX / FX1 / NFX) with T012 / T012K / BNKA / TBCHAIN21. No service serves VTBSTC1 or the house banks.
 */
export const ACCOUNT_WAITING =
  `${WAITING_API} — settlement account lines (standing instructions VTBSTC1 with house bank T012K / BNKA) have no API.`

/** An address block with nothing in it (no Z002 address, or not read yet). */
export function emptyAddress(): BankAddress {
  return { zdate: '', zbank: '', zaddr1: '', zaddr2: '', zaddr3: '', zattn: '', zvdate: '' }
}

/** PRINT: gs_data-butxt+7(31) as the signing company, gv_reg, the deal row, GET_ADDR's address. */
export function buildLetterModel(row: Deal, addr: BankAddress = emptyAddress(), addrNote = ''): LetterModel {
  const company = row.butxt.slice(7, 38) // gs_data-butxt+7(31)
  return { row, company, addr, addrNote, reg: LETTER_REG, lines: [ACCOUNT_WAITING] }
}

/** Heads and values of the letter's deal table; numIdx marks the right-aligned columns. */
export function letterDealTable(m: LetterModel): { heads: string[]; vals: string[]; numIdx: number[] } {
  const r = m.row
  return {
    heads: [
      'Transaction No',
      'Company Code',
      'Company Name',
      'Business Partner',
      'Partner Name',
      'Trade Date',
      'Value Date',
      'Fixing Date',
      'NDF Rate',
      'Cash Currency',
      'Cash Amount',
    ],
    vals: [
      r.rfha,
      r.bukrs,
      m.company,
      r.kontrh,
      r.bp_name,
      isoToDmy(r.dblfz),
      isoToDmy(r.delfz),
      isoToDmy(r.ndf_date),
      r.settlement_known ? formatRate(r.ndf_rate) : '',
      r.cash_curr,
      r.settlement_known ? formatAmount(r.zcash_amt) : '',
    ],
    numIdx: [8, 10],
  }
}

/* ------------------------------------------------------------------ PDF1: the letter as a PDF, built in the browser */
/** One text line (or a rule) of the letter page, in PDF points from the bottom-left. */
export type PdfItem = { t?: string; x?: number; y: number; bold?: boolean; size?: number; rule?: boolean }

/** PDF string literal: ASCII only, with \ ( ) escaped. */
export const pdfEscape = (v: string) => v.replace(/[^\x20-\x7E]/g, '-').replace(/([\\()])/g, '\\$1')

/** A one-page A4 PDF (Helvetica, ASCII) of the given items. Pure: returns the file's bytes. */
export function buildPdf(items: readonly PdfItem[]): Uint8Array<ArrayBuffer> {
  let ops = ''
  for (const it of items) {
    if (it.rule) ops += `0.8 G 50 ${it.y} m 545 ${it.y} l S\n`
    else ops += `BT /${it.bold ? 'F2' : 'F1'} ${it.size ?? 10} Tf ${it.x ?? 50} ${it.y} Td (${pdfEscape(it.t ?? '')}) Tj ET\n`
  }
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${ops.length} >>\nstream\n${ops}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${padLeft(o, 10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const bytes = new Uint8Array(new ArrayBuffer(out.length))
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255
  return bytes
}

/** The letter (screen 9001's content) laid out for buildPdf. */
export function letterPdfItems(m: LetterModel): PdfItem[] {
  const a = m.addr
  const items: PdfItem[] = []
  let y = 790
  const line = (t: string, o: { bold?: boolean; size?: number; x?: number } = {}) => {
    if (t) items.push({ t, y, bold: !!o.bold, size: o.size ?? 10, x: o.x ?? 50 })
    y -= 15
  }
  line(a.zdate, { x: 480 })
  y -= 6
  line(a.zbank, { bold: true, size: 11 })
  line(a.zaddr1)
  line(a.zaddr2)
  line(a.zaddr3)
  y -= 4
  line(a.zattn, { bold: true })
  y -= 8
  line(`RE: ${m.reg}`, { bold: true, size: 11 })
  line(a.zvdate, { bold: true })
  y -= 4
  items.push({ rule: true, y })
  y -= 18
  const t = letterDealTable(m)
  t.heads.forEach((h, i) => {
    items.push({ t: `${h}:`, y, bold: true, x: 50 })
    items.push({ t: t.vals[i] || '-', y, x: 190 })
    y -= 16
  })
  y -= 2
  items.push({ rule: true, y })
  y -= 18
  for (const l of m.lines) line(l)
  y -= 30
  line('Authorized Signatories', { bold: true })
  y -= 34
  line('Yours Faithfully')
  line(m.company, { bold: true })
  return items
}

/** PDF1's file name. */
export const letterPdfName = (r: Deal) => `NDF_Bank_Settlement_${r.rfha}.pdf`
