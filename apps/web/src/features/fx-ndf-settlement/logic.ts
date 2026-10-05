import {
  AS_OF,
  BKPF_SEEDS,
  COLUMN_CATALOG,
  COMPANIES,
  DEAL_SEEDS,
  DEFAULTS,
  FIRST_DOC_NO,
  FIX_FO_REMARKS,
  FIX_MO_REMARKS,
  FLOW_SEEDS,
  FO_REMARKS,
  LAYOUT_VARIANTS,
  MO_REMARKS,
  PARTNERS,
  PORTFOLIOS,
  TRADERS,
  TXN_STATUS_META,
  UNKNOWN_STATUS_CLASS,
} from './data.ts'
import {
  addDays,
  dateToIso,
  formatAmount,
  formatRate,
  isoToDmy,
  padLeft,
  pad2,
  parseDateInput,
  prevBusinessDay,
  rollBackWeekend,
  round,
} from './format.ts'
import type {
  ActionName,
  BankAddress,
  BuySell,
  CalendarCell,
  CalendarView,
  ColumnKey,
  Company,
  Criteria,
  CriteriaError,
  DateErr,
  Db,
  Deal,
  DealSeed,
  DropdownItem,
  LayoutVariant,
  LetterModel,
  Partner,
  PdfItem,
  RunResult,
  RunView,
  Sort,
} from './types.ts'

/* ------------------------------------------------------------------ lookups */
export function findCompany(code: string): Company {
  const c = COMPANIES.find((x) => x.code === code)
  if (!c) throw new Error(`Unknown company code ${code}`)
  return c
}

export function findPartner(id: string): Partner | undefined {
  const plain = String(id).replace(/^0+/, '')
  return PARTNERS.find((p) => p.id === plain)
}

export function findLayout(id: string): LayoutVariant {
  return LAYOUT_VARIANTS.find((l) => l.id === id) ?? LAYOUT_VARIANTS[0]!
}

/* ------------------------------------------------------------------ mock database */
/** Net NDF settlement in USD: Buy USD = N*(F-K)/F, Sell USD is the opposite sign. */
export function calcNdfCashAmount(bs: BuySell, notionalUsd: number, contractRate: number, fixingRate: number): number {
  let amt = (notionalUsd * (fixingRate - contractRate)) / fixingRate
  if (bs === 'S') amt = -amt
  return round(amt, 2)
}

/** One VTBFHA row from its seed; every dependent value is derived, never hard-coded per row. */
export function buildDeal(seed: DealSeed, idx: number): Deal {
  const [rfha, bukrs, partnerIdx, bs, N, K, F, vdate, tenor, txnStatus, saktiv, sgsart, mcRef, traderIdx] = seed
  const co = findCompany(bukrs)
  const bank = PARTNERS[partnerIdx]!
  const swap = round((K * 0.0025 * tenor) / 90, 4)
  const pf = PORTFOLIOS[idx % PORTFOLIOS.length]!
  const trader = TRADERS[traderIdx]!
  const tradeDate = rollBackWeekend(addDays(vdate, -tenor))
  const fixDate = prevBusinessDay(vdate, 2)
  const n = idx + 1
  return {
    bukrs: co.code,
    rfha,
    saktiv,
    sgsart,
    rfhazul: '00001',
    butxt: `${co.code} - ${co.name}`,
    ltx: 'FX Non-Deliverable Fwd',
    sfhaart: 'NDF',
    xtext: 'Non-Deliverable Forward',
    kontrh: bank.id,
    bp_name: bank.name,
    gsppart: bank.contact,
    blotter_date: tradeDate,
    prctr: co.pc,
    pc_name: co.pcName,
    rbusa: co.ba,
    ba_name: co.baName,
    rportb: pf.rportb,
    xportb: pf.xportb,
    refer: `TSF-NDF-${padLeft(n, 4, '0')}`,
    nordext: `${bank.name.slice(0, 4).toUpperCase()}/NDF/26/${padLeft(n * 7 + 120, 4, '0')}`,
    dblfz: tradeDate,
    delfz: vdate,
    zcom_id: co.tsfEntity,
    rdealer: trader,
    txn_status: txnStatus,
    ztsf_deal_id: `D26-${co.code.slice(0, 2)}-${padLeft(n * 13 + 300, 4, '0')}`,
    ztsf_mc_ref_no: mcRef,
    ndf_date: fixDate,
    ndf_ref: `FIX-${fixDate.replace(/-/g, '')}-${padLeft(n, 3, '0')}`,
    ndf_rate: F,
    fo_remark: FO_REMARKS[idx % FO_REMARKS.length]!,
    mo_remark: MO_REMARKS[idx % MO_REMARKS.length]!,
    ndf_fo_rem: FIX_FO_REMARKS[idx % FIX_FO_REMARKS.length]!,
    ndf_mo_rem: FIX_MO_REMARKS[idx % FIX_MO_REMARKS.length]!,
    bs,
    bs_1: bs === 'B' ? 'Buy' : 'Sell',
    bs_2: bs === 'B' ? 'Sell' : 'Buy',
    curr1: 'USD',
    amt1: N,
    curr2: co.local,
    amt2: round(N * K, 2),
    ospot: round(K - swap, 4),
    oswap: swap,
    otot_rate: K,
    spot: round(K - swap, 4),
    swap,
    tot_rate: K,
    t_rate: K,
    cpair: co.pair,
    zwaers: co.local,
    cash_curr: 'USD',
    zcash_amt: calcNdfCashAmount(bs, N, K, F),
    cruser: trader,
    dcrdat: tradeDate,
    upuser: TRADERS[(traderIdx + 1) % TRADERS.length]!,
    dupdat: fixDate,
    fi_doc: '',
  }
}

export function cloneDb(db: Db): Db {
  return JSON.parse(JSON.stringify(db)) as Db
}

/** The initial database: VTBFHA, BKPF and the posted flow rows (whose deals already carry status 50). */
export function buildMockDb(): Db {
  const db: Db = { vtbfha: [], vtbfhapo: [], bkpf: [], nextDocNo: FIRST_DOC_NO }
  DEAL_SEEDS.forEach((s, i) => db.vtbfha.push(buildDeal(s, i)))
  BKPF_SEEDS.forEach((b) => {
    const [bukrs, belnr, gjahr, xblnr, waers, blart, budat, xref2_hd, xreversal, xreversing] = b
    db.bkpf.push({ bukrs, belnr, gjahr, xblnr, waers, blart, budat, xref2_hd, xreversal, xreversing })
  })
  FLOW_SEEDS.forEach((r) => {
    const d = db.vtbfha.find((x) => x.rfha === r)
    if (!d) return
    db.vtbfhapo.push({ bukrs: d.bukrs, rfha: r, rfhazu: d.rfhazul, sbewebe: '2' })
    d.txn_status = '50' // already posted deals carry status 50, so the report never lists them
  })
  return db
}

/* ------------------------------------------------------------------ GET_DATA */
export function rowId(r: Pick<Deal, 'bukrs' | 'rfha'>): string {
  return `${r.bukrs}|${r.rfha}`
}

/** Valid FI document of a deal: BKPF type TR, reference key 2 'TSF', not reversed and not a reversal. */
export function matchesFiDoc(
  b: Db['bkpf'][number],
  rfha: string,
  cashCurr: string,
  dateFrom: string,
  dateTo: string,
): boolean {
  return (
    b.waers === cashCurr &&
    b.xblnr === rfha &&
    b.blart === 'TR' &&
    b.xref2_hd === 'TSF' &&
    b.xreversal !== '2' &&
    b.xreversing !== 'X' &&
    b.budat >= dateFrom &&
    b.budat <= dateTo
  )
}

/** FORM GET_DATA: the selection, the report's own deletions and the FI document lookup. */
export function getData(c: Criteria, db: Db): Deal[] {
  const from = c.dateFrom
  const to = c.dateTo || c.dateFrom // S_DATE without HIGH behaves as EQ
  let rows: Deal[] = []
  db.vtbfha.forEach((r) => {
    if (!c.bukrs.includes(r.bukrs)) return // bukrs IN s_bukrs
    if (r.sgsart !== '12D') return // sgsart = '12D'
    if (c.rfha && !String(r.rfha).includes(c.rfha)) return // rfha IN s_rfha
    if (r.delfz < from || r.delfz > to) return // delfz IN s_date
    if (r.saktiv === '3') return // saktiv <> 3
    rows.push({ ...r })
  })
  rows = rows.filter((r) => !(r.txn_status < '07'))
  rows = rows.filter((r) => r.txn_status !== '08')
  // sgsart+2(1) = 'D' AND txn_status <> '13' -> only status 13 survives
  rows = rows.filter((r) => !(r.sgsart.charAt(2) === 'D' && r.txn_status !== '13'))
  rows.forEach((r) => {
    const hit = db.bkpf.find((b) => matchesFiDoc(b, r.rfha, r.cash_curr, from, to))
    r.fi_doc = hit ? hit.belnr : ''
    r.fi_gjahr = hit ? hit.gjahr : ''
  })
  return rows
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
/** Ticks or unticks one company; the list keeps the panel's own order, as the original rebuilt it from the checkboxes. */
export function toggleCompany(selected: string[], code: string, on: boolean): string[] {
  const rest = selected.filter((c) => c !== code)
  if (!on) return rest
  return COMPANIES.map((c) => c.code).filter((c) => c === code || rest.includes(c))
}

export function allCompanies(): string[] {
  return COMPANIES.map((c) => c.code)
}

/** The trigger's text: null when nothing is selected (the placeholder shows). */
export function companySummary(selected: string[]): string | null {
  if (!selected.length) return null
  if (selected.length === COMPANIES.length) return `All (${selected.length})`
  return COMPANIES.filter((c) => selected.includes(c.code))
    .map((c) => c.code)
    .join(', ')
}

/* ------------------------------------------------------------------ table */
export function statusText(code: string): string {
  const m = TXN_STATUS_META[code]
  return `${code} - ${m ? m.text : code}`
}

export function statusClass(code: string): string {
  return TXN_STATUS_META[code]?.cls ?? UNKNOWN_STATUS_CLASS
}

/** The text a cell shows (and the search matches). */
export function cellValue(key: ColumnKey, row: Deal): string {
  const col = COLUMN_CATALOG[key]
  const v = row[key]
  if (key === 'txn_status') return statusText(String(v))
  if (key === 'fi_doc') return String(v || '')
  if (col.type === 'date') return isoToDmy(String(v))
  if (col.type === 'amount') return formatAmount(Number(v))
  if (col.type === 'rate') return formatRate(Number(v))
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

export function emptyText(hasErrors: boolean, search: string): string {
  if (hasErrors) return 'Complete the required selection criteria to list NDF deals.'
  return search ? 'No NDF deals match your search.' : 'No NDF deals match the current selection.'
}

/* ------------------------------------------------------------------ value helps */
/** Transaction No value help: deals passing the report's own selection (company / dates), by transaction number. */
export function rfhaItems(criteria: Criteria, hasBukrsError: boolean, db: Db, filter: string): DropdownItem[] {
  const probe: Criteria = {
    bukrs: criteria.bukrs,
    dateFrom: criteria.dateFrom || '0000-01-01',
    dateTo: criteria.dateTo || criteria.dateFrom || '9999-12-31',
    rfha: '',
  }
  const list = hasBukrsError ? [] : getData(probe, db)
  const f = String(filter || '').toLowerCase()
  return list
    .filter((r) => !f || r.rfha.includes(f) || r.bp_name.toLowerCase().includes(f))
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

/* ------------------------------------------------------------------ posting run (RFTBBB00, simulated) */
/** Creates FI documents and flow rows unless it is a test run; returns the updated database and a result per deal. */
export function submitPostingRun(
  db: Db,
  deals: Deal[],
  keyDate: string,
  test: boolean,
): { db: Db; results: RunResult[] } {
  const next = cloneDb(db)
  const results: RunResult[] = []
  deals.forEach((d) => {
    const existing = next.bkpf.find((b) => matchesFiDoc(b, d.rfha, d.cash_curr, '0000-01-01', '9999-12-31'))
    if (existing) {
      if (!test && !next.vtbfhapo.some((p) => p.bukrs === d.bukrs && p.rfha === d.rfha))
        next.vtbfhapo.push({ bukrs: d.bukrs, rfha: d.rfha, rfhazu: d.rfhazul, sbewebe: '2' }) // posted flow exists with the FI document
      results.push({ bukrs: d.bukrs, rfha: d.rfha, keyDate, result: 'Already posted', cls: 'res-info', fiDoc: existing.belnr })
    } else if (test) {
      results.push({ bukrs: d.bukrs, rfha: d.rfha, keyDate, result: 'Would be posted', cls: 'res-warn', fiDoc: '' })
    } else {
      const belnr = String(next.nextDocNo++)
      next.bkpf.push({
        bukrs: d.bukrs,
        belnr,
        gjahr: d.delfz.slice(0, 4),
        xblnr: d.rfha,
        waers: d.cash_curr,
        blart: 'TR',
        budat: d.delfz,
        xref2_hd: 'TSF',
        xreversal: '',
        xreversing: '',
      })
      next.vtbfhapo.push({ bukrs: d.bukrs, rfha: d.rfha, rfhazu: d.rfhazul, sbewebe: '2' })
      results.push({ bukrs: d.bukrs, rfha: d.rfha, keyDate, result: 'Posted', cls: 'res-ok', fiDoc: belnr })
    }
  })
  return { db: next, results }
}

/** After TBB1: where a posted flow exists (VTBFHAPO, sbewebe = '2') VTBFHA-TXN_STATUS becomes '50'. */
export function updateStatusAfterPosting(
  db: Db,
  deal: Pick<Deal, 'bukrs' | 'rfha' | 'rfhazul'>,
): { db: Db; updated: number } {
  const next = cloneDb(db)
  const hits = next.vtbfhapo.filter(
    (p) => p.bukrs === deal.bukrs && p.rfha === deal.rfha && p.rfhazu === deal.rfhazul && p.sbewebe === '2',
  )
  let updated = 0
  hits.forEach((h) => {
    next.vtbfha.forEach((r) => {
      if (r.bukrs === h.bukrs && r.rfha === h.rfha) {
        r.txn_status = '50'
        updated++
      }
    })
  })
  return { db: next, updated }
}

export function runSummary(results: RunResult[]): { would: number; posted: number; already: number } {
  return {
    would: results.filter((r) => r.result === 'Would be posted').length,
    posted: results.filter((r) => r.result === 'Posted').length,
    already: results.filter((r) => r.result === 'Already posted').length,
  }
}

/** TBB1 Test Run of one deal. Nothing is created and nothing changes. */
export function singleTestView(db: Db, row: Deal): RunView {
  const { results } = submitPostingRun(db, [row], row.delfz, true)
  return {
    title: 'TBB1 Test Run',
    params: [
      ['Company Code', row.bukrs],
      ['Transaction No', row.rfha],
      ['Key Date (Value Date)', isoToDmy(row.delfz)],
      ['Run mode', 'Test run – no update'],
    ],
    results,
    notes:
      'Demo simulation of the standard posting run (RFTBBB00) in test mode. No documents are created and no status is changed.',
  }
}

/** TBB1 Post of one deal: the new database and the result to show. */
export function singlePost(db: Db, row: Deal): { db: Db; view: RunView } {
  const run = submitPostingRun(db, [row], row.delfz, false)
  const upd = updateStatusAfterPosting(run.db, row)
  return {
    db: upd.db,
    view: {
      title: 'TBB1 Post',
      params: [
        ['Company Code', row.bukrs],
        ['Transaction No', row.rfha],
        ['Key Date (Value Date)', isoToDmy(row.delfz)],
        ['Run mode', 'Update run'],
      ],
      results: run.results,
      notes:
        'Demo simulation of the standard posting run (RFTBBB00).' +
        (upd.updated
          ? ' Transaction status set to 50 and removed from the list.'
          : ' No posted flow found, so the transaction remains in the list.'),
    },
  }
}

/** View With Posting + Execute: ALL_POSTING for every deal in the selection. */
export function postAll(db: Db, deals: Deal[], criteria: Criteria, keyDate: string): { db: Db; view: RunView } {
  const run = submitPostingRun(db, deals, keyDate, false)
  let next = run.db
  deals.forEach((d) => {
    next = updateStatusAfterPosting(next, d).db // posted deals leave the list
  })
  return {
    db: next,
    view: {
      title: 'Execute with Posting',
      params: [
        ['Company Code', criteria.bukrs.join(', ')],
        ['Value Date', isoToDmy(criteria.dateFrom) + (criteria.dateTo ? ` to ${isoToDmy(criteria.dateTo)}` : '')],
        ['Key Date', isoToDmy(keyDate)],
        ['Run mode', 'Update run – all deals in selection'],
      ],
      results: run.results,
      notes:
        'Demo simulation of the standard posting run (RFTBBB00). Posted transactions now carry status 50 and have been removed from the list.',
    },
  }
}

/** Key date of the Execute run: the To date, else the From date. */
export function keyDateOf(criteria: Criteria): string {
  return criteria.dateTo || criteria.dateFrom
}

export function actionLabel(name: ActionName): string {
  return { preview: 'Preview Document', pdf: 'PDF', test: 'TBB1 Test Run', post: 'TBB1 Post' }[name]
}

/* ------------------------------------------------------------------ bank settlement letter */
/** go_obj_data->get_addr: the bank address block for the letter (dummy). */
export function getBankAddress(valueDate: string, kontrh10: string): BankAddress {
  const p = findPartner(kontrh10) ?? PARTNERS[0]!
  return {
    zdate: isoToDmy(AS_OF),
    zbank: p.formal,
    zaddr1: p.addr[0],
    zaddr2: p.addr[1],
    zaddr3: p.addr[2],
    zattn: p.attn,
    zvdate: `Value Date: ${isoToDmy(valueDate)}`,
  }
}

/** go_obj_data->get_data: the settlement account lines for the letter (dummy). */
export function getBankTransferLines(
  bukrs: string,
  kontrh10: string,
  items: { zcurr: string; zamt: number }[],
): string[] {
  const co = findCompany(bukrs)
  const p = findPartner(kontrh10) ?? PARTNERS[0]!
  const out: string[] = []
  items.forEach((it) => {
    out.push(`Settlement amount: ${it.zcurr} ${formatAmount(Math.abs(it.zamt))}`)
    out.push(`Beneficiary: ${co.name}`)
    out.push(`Account no. (${it.zcurr}): ${co.acct}`)
    out.push(`Account with: ${p.formal} (${p.swift})`)
  })
  return out
}

export function buildLetterModel(row: Deal): LetterModel {
  const kontrh10 = padLeft(row.kontrh, 10, '0') // ALPHA = IN
  const company = row.butxt.slice(7, 38) // gs_data-butxt+7(31)
  const addr = getBankAddress(row.delfz, kontrh10)
  const lines = getBankTransferLines(row.bukrs, kontrh10, [{ zcurr: row.cash_curr, zamt: row.zcash_amt }])
  return { row, company, addr, reg: 'NDF Bank Settlement', lines }
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
      formatRate(r.ndf_rate),
      r.cash_curr,
      formatAmount(r.zcash_amt),
    ],
    numIdx: [8, 10],
  }
}

/* ------------------------------------------------------------------ PDF */
export function pdfFileName(row: Pick<Deal, 'rfha'>): string {
  return `NDF_Bank_Settlement_${row.rfha}.pdf`
}

/** The drawing operations of the letter PDF (A4, Helvetica). */
export function letterPdfItems(m: LetterModel): PdfItem[] {
  const a = m.addr
  const r = m.row
  const items: PdfItem[] = []
  let y = 790
  const line = (t: string, o: { bold?: boolean; size?: number; x?: number; gap?: number } = {}) => {
    items.push({ t, y, bold: o.bold, size: o.size, x: o.x })
    y -= o.gap ?? 15
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
  const pairs: [string, string][] = [
    ['Transaction No', r.rfha],
    ['Company Code', r.bukrs],
    ['Company Name', m.company],
    ['Business Partner', `${r.kontrh}  ${r.bp_name}`],
    ['Trade Date', isoToDmy(r.dblfz)],
    ['Value Date', isoToDmy(r.delfz)],
    ['Fixing Date', isoToDmy(r.ndf_date)],
    ['NDF Rate', formatRate(r.ndf_rate)],
    ['Cash Amount', `${r.cash_curr} ${formatAmount(r.zcash_amt)}`],
  ]
  pairs.forEach((p) => {
    items.push({ t: `${p[0]}:`, y, bold: true, x: 50 })
    items.push({ t: p[1], y, x: 170 })
    y -= 16
  })
  y -= 2
  items.push({ rule: true, y })
  y -= 18
  m.lines.forEach((l) => line(l))
  y -= 30
  line('Authorized Signatories', { bold: true })
  y -= 34
  line('Yours Faithfully')
  line(m.company, { bold: true })
  return items
}

/** Printable ASCII only: anything else becomes "-", and the PDF string delimiters are escaped. */
export function pdfEscape(s: string): string {
  return String(s)
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/([\\()])/g, '\\$1')
}

/** Minimal single-page PDF (Helvetica, ASCII only) as the file's text. */
export function buildPdfString(items: PdfItem[]): string {
  let ops = ''
  items.forEach((it) => {
    if (it.rule) {
      ops += `0.8 G 50 ${it.y} m 545 ${it.y} l S\n`
      return
    }
    ops += `BT /${it.bold ? 'F2' : 'F1'} ${it.size || 10} Tf ${it.x || 50} ${it.y} Td (${pdfEscape(it.t)}) Tj ET\n`
  })
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
  offsets.forEach((o) => {
    out += `${padLeft(o, 10, '0')} 00000 n \n`
  })
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return out
}

/** The PDF's bytes: one byte per character. */
export function buildPdfBytes(items: PdfItem[]): Uint8Array<ArrayBuffer> {
  const out = buildPdfString(items)
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255
  return bytes
}
