import {
  ACC_CONFIG,
  BUSINESS_PARTNERS,
  CLOSED_PERIODS,
  COLUMNS,
  COMPANY_CODES,
  CURRENCY_PAIRS,
  DAY_NAMES,
  DEAL_SPECS,
  EXCLUDED_TXN_STATUSES,
  INITIAL_NEXT_DOC,
  LAYOUTS,
  MONTH_SHORT,
  PRODUCT_TYPES,
  SEEDED_LATEST_KEY_DATE,
  SEEDED_LATEST_POSTINGS,
  SEEDED_MONTH_ENDS,
  SPOT_RATES_BY_DATE,
  SWAP_CURVES,
} from './data.ts'
import {
  addDaysISO,
  formatAmount,
  formatDMY,
  formatRate,
  isMonthEnd,
  isoToDMY,
  monthsBetween,
  pad2,
  parseDMY,
  round2,
  round6,
  sameDay,
  toISO,
} from './format.ts'
import type {
  AccConfig,
  CalendarDay,
  CalendarView,
  ColumnKey,
  DealSpec,
  DetailItem,
  DocView,
  Filters,
  LogMsg,
  MockDb,
  MtmRow,
  PendingRun,
  PostingItem,
  SelectionParams,
  Sort,
  TxnView,
  ViewRecord,
} from './types.ts'

export const DEFAULT_FILTERS: Filters = { rfha: '', bp: '', pair: '', deal: 'all' }
export const DEFAULT_SORT: Sort = { field: null, dir: 'asc' }

export const MSG_REFRESHED = 'Screen refreshed.'
export const MSG_CHECK_FIELDS = 'Check the highlighted selection fields.'
export const MSG_POSTED = 'Document Posted Successfully'
export const ERR_COMPANY_REQUIRED = 'Company Code is required.'
export const ERR_KEY_REQUIRED = 'Key Date is required.'
export const ERR_KEY_INVALID = 'Enter a valid date (DD-MM-YYYY).'
export const ERR_KEY_MONTH_END = 'Key Date should be Month End Date only.'

// ------------------------------------------------------------------ lookups

export function findCompany(code: string) {
  return COMPANY_CODES.find((c) => c.code === code) ?? null
}

/** Position in the authorised list; unknown codes sort last. */
export function companyIndex(code: string): number {
  const i = COMPANY_CODES.findIndex((c) => c.code === code)
  return i === -1 ? 99 : i
}

export function isNdf(row: { sgsart: string }): boolean {
  return row.sgsart.charAt(2) === 'D'
}

export function allCompanyCodes(): string[] {
  return COMPANY_CODES.map((c) => c.code)
}

// ------------------------------------------------------------------ calculations (GET_DATA / SWAP_CALC)

/** Builds the raw view record (ZSGTSFV_FX) from a deal spec and the lookups. */
export function buildViewRecord(spec: DealSpec): ViewRecord {
  const cc = COMPANY_CODES.find((c) => c.code === spec.bukrs)
  const bp = BUSINESS_PARTNERS.find((b) => b.id === spec.bp)
  const cp = CURRENCY_PAIRS.find((p) => p.pair === spec.pair)
  if (!cc || !bp || !cp) throw new Error(`Unknown lookup for deal ${spec.rfha}`)
  const [curr1 = '', curr2 = ''] = cp.pair.split('/')
  const buy = spec.side === 'Buy'
  const sign1 = buy ? 1 : -1
  return {
    bukrs: cc.code,
    butxt: cc.name,
    rfha: spec.rfha,
    kontrh: bp.id,
    bp_name: bp.name,
    sgsart: spec.sgsart,
    xtext: PRODUCT_TYPES[spec.sgsart] ?? '',
    cpair: cp.pair,
    curr1,
    curr2,
    amt1: sign1 * spec.amt,
    amt2: -sign1 * round2(spec.amt * spec.rate),
    bs_1: spec.side,
    bs_2: buy ? 'Sell' : 'Buy',
    f_curr1: cp.f,
    t_curr1: cp.t,
    c_rate: spec.rate,
    dblfz: spec.trade,
    delfz: spec.value,
    txn_status: spec.st,
    saktiv: spec.saktiv ?? '1',
    nordext: spec.ext,
    ztsf_deal_id: `TSF-${spec.rfha.slice(2)}`,
    zolam_deal_no: `OLM-${spec.rfha.slice(6)}`,
    prctr: cc.prctr,
    pc_name: cc.pcName,
    rbusa: cc.rbusa,
    ba_name: cc.baName,
  }
}

/** The spot of the latest rate date on or before the key date (the earliest one when none is). */
export function spotFor(keyISO: string, pair: string): number {
  const dates = Object.keys(SPOT_RATES_BY_DATE).sort()
  let use = dates[0] ?? ''
  for (const d of dates) if (d <= keyISO) use = d
  return SPOT_RATES_BY_DATE[use]?.[pair] ?? 0
}

/** SWAP_CALC: an exact tenor takes its swap, a tenor between two buckets is interpolated linearly. */
export function swapFor(pair: string, months: number): number {
  const curve = SWAP_CURVES[pair]
  if (!curve || months < 1 || months > 60) return 0
  let low: readonly [number, number] | null = null
  let high: readonly [number, number] | null = null
  for (const p of curve) {
    if (p[0] <= months) low = p
    else if (high === null) high = p
  }
  if (low === null) return 0
  if (low[0] === months || high === null) return low[1]
  const perMonth = (high[1] - low[1]) / (high[0] - low[0])
  return round6(low[1] + perMonth * (months - low[0]))
}

/**
 * Values one transaction at the key date. The foreign leg is the non-USD one; USD amount converts it
 * at the all-in rate and valuation amount at the valuation rate (spot + swap). The gain/loss is the
 * absolute difference, negated for a Buy when the all-in rate is at or below the valuation rate and
 * for a Sell when it is above.
 */
export function calculateValuation(rec: ViewRecord, keyISO: string): MtmRow {
  const fAmt = rec.curr1 !== 'USD' ? Math.abs(rec.amt1) : Math.abs(rec.amt2)
  const fCurr = rec.curr1 !== 'USD' ? rec.curr1 : rec.curr2

  // Buy / Sell shown to the user (BS_O = '1' means Sell).
  const lvBs = rec.curr1 === fCurr ? rec.bs_1 : rec.bs_2
  const bsO = lvBs === 'Sell' ? '1' : '2'

  const usdAmt = rec.f_curr1 !== 'USD' ? round2(Math.abs(fAmt) * rec.c_rate) : rec.c_rate ? round2(Math.abs(fAmt) / rec.c_rate) : 0

  // Valuation rate = spot + swap.
  const vSpot = spotFor(keyISO, rec.cpair)
  let monat = monthsBetween(keyISO, rec.delfz)
  let vSwap: number
  if (monat < 1 || monat > 60) {
    monat = 0
    vSwap = 0
  } else {
    vSwap = swapFor(rec.cpair, monat)
  }
  const vRate = round6(vSpot + vSwap)

  let vAmt = 0
  if (rec.f_curr1 !== 'USD') vAmt = round2(Math.abs(fAmt) * vRate)
  else if (vRate) vAmt = round2(Math.abs(fAmt) / vRate)

  let vGl = Math.abs(vAmt ? round2(vAmt - usdAmt) : 0)
  if (lvBs === 'Buy') {
    if (rec.c_rate <= vRate) vGl = -vGl
  } else if (!(rec.c_rate <= vRate)) {
    vGl = -vGl
  }

  return {
    ...rec,
    f_amt: fAmt,
    f_curr: fCurr,
    bs_o: bsO,
    bs_bu: bsO === '1' ? 'Sell' : 'Buy',
    usd_amt: usdAmt,
    v_spot: vSpot,
    monat,
    v_swap: vSwap,
    v_rate: vRate,
    v_amt: vAmt,
    v_gl: vGl,
    month: `${MONTH_SHORT[parseInt(rec.delfz.slice(5, 7), 10) - 1] ?? ''} ${rec.delfz.slice(0, 4)}`,
    mtm_doc: '',
    rev_doc: '',
    msg: '',
    id: `${rec.bukrs}|${rec.rfha}`,
  }
}

export function isEligibleForPosting(row: MtmRow): boolean {
  return !row.mtm_doc && row.v_gl !== 0
}

/** Why a row cannot be posted, or '' when it can. */
export function postBlockReason(row: MtmRow | null): string {
  if (!row) return 'Select a transaction first.'
  if (row.mtm_doc) return 'This transaction already has an MTM document.'
  if (row.v_gl === 0) return 'This transaction has no valuation gain/loss to post.'
  return ''
}

// ------------------------------------------------------------------ data / service layer (mock)

/** FORM GET_DATA: selects, values and (unless skipJoin) joins the posted documents of the mock tables. */
export function fetchMtmRows(
  db: MockDb | null,
  params: { company: readonly string[]; keyDate: string },
  skipJoin = false,
): MtmRow[] {
  const kd = params.keyDate
  const out: MtmRow[] = []
  for (const spec of DEAL_SPECS) {
    const rec = buildViewRecord(spec)
    if (!params.company.includes(rec.bukrs)) continue // BUKRS IN s_bukrs
    if (!(rec.dblfz <= kd && rec.delfz > kd)) continue // DBLFZ <= p_date < DELFZ
    if (rec.saktiv === '3') continue // SAKTIV <> '3'
    if (EXCLUDED_TXN_STATUSES.includes(rec.txn_status)) continue
    const row = calculateValuation(rec, kd)
    if (!skipJoin && db) {
      const m = db.mtmData.find((x) => x.zbukrs === row.bukrs && x.zrfha === row.rfha && x.zdate === kd && x.ztype === '01')
      if (m) {
        row.mtm_doc = m.zdoc
        row.rev_doc = m.zrev_doc
        row.msg = m.zmsg
      }
    }
    out.push(row)
  }
  return out.sort((a, b) => {
    if (a.bukrs !== b.bukrs) return companyIndex(a.bukrs) - companyIndex(b.bukrs)
    return a.rfha < b.rfha ? -1 : a.rfha > b.rfha ? 1 : 0
  })
}

/** The mock tables as they stand when the screen opens or is refreshed. */
export function createMockDb(): MockDb {
  const mtmData: MockDb['mtmData'] = []
  for (const [keyDate, base] of SEEDED_MONTH_ENDS) {
    const rows = fetchMtmRows(null, { company: allCompanyCodes(), keyDate }, true)
    let n = 0
    rows.forEach((r, i) => {
      if (i % 2 === 0 && r.v_gl !== 0) {
        mtmData.push({
          zbukrs: r.bukrs,
          zrfha: r.rfha,
          zdate: keyDate,
          ztype: '01',
          zdoc: String(base + n),
          zrev_doc: String(base + n + 1),
          zmsg: MSG_POSTED,
        })
        n += 2
      }
    })
  }
  for (const [bukrs, rfha, doc] of SEEDED_LATEST_POSTINGS) {
    mtmData.push({
      zbukrs: bukrs,
      zrfha: rfha,
      zdate: SEEDED_LATEST_KEY_DATE,
      ztype: '01',
      zdoc: String(doc),
      zrev_doc: String(doc + 1),
      zmsg: MSG_POSTED,
    })
  }
  return { mtmData, nextDoc: INITIAL_NEXT_DOC }
}

export function findAccConfig(bukrs: string, glType: 'ML' | 'MG', ndf: boolean): AccConfig | null {
  return ACC_CONFIG.find((a) => a.zbukrs === bukrs && a.type === glType && a.zndf === (ndf ? 'X' : '')) ?? null
}

export function glPad(gl: string): string {
  return `0000000000${gl}`.slice(-10)
}

/** The gain/loss account type a row posts to: a loss (negative) is ML, a gain MG. */
export function glTypeOf(row: MtmRow): 'ML' | 'MG' {
  return row.v_gl < 0 ? 'ML' : 'MG'
}

/** The two line items FORM DEBIT / CREDIT build for the BAPI; the reversal flips both signs. */
export function buildPostingItems(row: MtmRow, cfg: AccConfig, reversed: boolean): PostingItem[] {
  const amt = Math.abs(row.v_gl)
  const s = reversed ? -1 : 1
  return [
    { item: 1, gl: glPad(cfg.gl_debit), amount: s * amt, pc: cfg.pc_debit || row.prctr, ba: cfg.ba_debit || row.rbusa, text: `${cfg.doc_debit}:${row.xtext}` },
    { item: 2, gl: glPad(cfg.gl_credit), amount: -s * amt, pc: cfg.pc_credit || row.prctr, ba: cfg.ba_credit || row.rbusa, text: `${cfg.doc_credit}:${row.xtext}` },
  ]
}

/**
 * FORM POST_DOCUMNET + BAPI_POST + REVERSAL_POSTING. Returns the new mock tables and the gt_msg rows.
 * No account entry maintained posts nothing (ABAP swallows CX_SY_ITAB_LINE_NOT_FOUND); a closed
 * posting period is a BAPI error: rolled back, one error row. Otherwise the MTM document and its
 * automatic reversal (key date + 1, reason 02) take two numbers from the range.
 */
export function postMtmDocument(db: MockDb, row: MtmRow, keyISO: string): { db: MockDb; msgs: LogMsg[] } {
  const cfg = findAccConfig(row.bukrs, glTypeOf(row), isNdf(row))
  if (!cfg) return { db, msgs: [] }

  const period = keyISO.slice(0, 7)
  if (CLOSED_PERIODS[row.bukrs]?.includes(period)) {
    return {
      db,
      msgs: [
        {
          type: 'E',
          rfha: row.rfha,
          doc: '',
          diff: row.v_gl,
          rate: row.c_rate,
          message: `Posting period ${pad2(parseInt(period.slice(5, 7), 10))}/${period.slice(0, 4)} is not open for company code ${row.bukrs}`,
        },
      ],
    }
  }

  const doc = String(db.nextDoc + 1)
  const rev = String(db.nextDoc + 2)
  const msgs: LogMsg[] = [
    { type: 'S', rfha: row.rfha, doc, diff: row.v_gl, rate: row.c_rate, message: MSG_POSTED },
    { type: 'S', rfha: row.rfha, doc: rev, diff: row.v_gl, rate: row.c_rate, message: MSG_POSTED },
  ]

  // MODIFY ZSGTSFTR_MTMDATA
  const same = (m: MockDb['mtmData'][number]) => m.zbukrs === row.bukrs && m.zrfha === row.rfha && m.zdate === keyISO && m.ztype === '01'
  const mtmData = db.mtmData.some(same)
    ? db.mtmData.map((m) => (same(m) ? { ...m, zdoc: doc, zrev_doc: rev, zmsg: MSG_POSTED } : m))
    : [...db.mtmData, { zbukrs: row.bukrs, zrfha: row.rfha, zdate: keyISO, ztype: '01' as const, zdoc: doc, zrev_doc: rev, zmsg: MSG_POSTED }]
  return { db: { mtmData, nextDoc: db.nextDoc + 2 }, msgs }
}

/** FORM ALL_POSTING: posts every eligible row of a confirmed run, in order. */
export function massPost(db: MockDb, run: PendingRun): { db: MockDb; msgs: LogMsg[] } {
  let cur = db
  const msgs: LogMsg[] = []
  for (const r of run.eligible) {
    const res = postMtmDocument(cur, r, run.params.keyDate)
    cur = res.db
    msgs.push(...res.msgs)
  }
  return { db: cur, msgs }
}

// ------------------------------------------------------------------ selection screen

export type KeyDateCheck =
  | { ok: true; iso: string; text: string }
  | { ok: false; error: string; text: string }

/** AT SELECTION-SCREEN on the Key Date: required, a real dd-mm-yyyy date (normalised), a month end. */
export function validateKeyDate(text: string): KeyDateCheck {
  const v = text.trim()
  if (!v) return { ok: false, error: ERR_KEY_REQUIRED, text }
  const d = parseDMY(v)
  if (!d) return { ok: false, error: ERR_KEY_INVALID, text }
  const normalised = formatDMY(d)
  if (!isMonthEnd(d)) return { ok: false, error: ERR_KEY_MONTH_END, text: normalised }
  return { ok: true, iso: toISO(d), text: normalised }
}

export function validateCompany(company: readonly string[]): string | null {
  return company.length === 0 ? ERR_COMPANY_REQUIRED : null
}

/** The company list after one box is ticked or cleared; kept sorted like the original. */
export function toggleCompany(current: readonly string[], code: string, on: boolean): string[] {
  const next = current.filter((c) => c !== code)
  if (on) next.push(code)
  return next.sort()
}

export function companyDisplay(company: readonly string[]): { value: string; title: string } {
  return {
    value: company.join(', '),
    title: company.map((c) => `${c} · ${findCompany(c)?.name ?? ''}`).join('\n'),
  }
}

// ------------------------------------------------------------------ list: criteria, search, sort, paging

/** The toolbar criteria: transaction text, partner, pair and NDF / deliverable. */
export function applyCriteria(rows: readonly MtmRow[], f: Filters): MtmRow[] {
  const t = f.rfha.trim().toLowerCase()
  return rows.filter((r) => {
    if (t && !r.rfha.toLowerCase().includes(t)) return false
    if (f.bp && r.kontrh !== f.bp) return false
    if (f.pair && r.cpair !== f.pair) return false
    if (f.deal === 'ndf' && !isNdf(r)) return false
    if (f.deal === 'del' && isNdf(r)) return false
    return true
  })
}

/** What Execute does: list the rows, or - for View With FI Posting with something to post - ask first. */
export function planExecution(
  rows: MtmRow[],
  params: SelectionParams,
  filters: Filters,
): { kind: 'commit' } | { kind: 'confirm'; run: PendingRun } {
  if (params.posting === 'post') {
    const listed = applyCriteria(rows, filters)
    const eligible = listed.filter(isEligibleForPosting)
    if (eligible.length) return { kind: 'confirm', run: { params, eligible, listed: listed.length } }
  }
  return { kind: 'commit' }
}

export function layoutColumns(layoutId: string): readonly ColumnKey[] {
  return (LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS[0])?.cols ?? []
}

/** Text of a cell as shown (and searched). */
export function cellText(key: ColumnKey, r: MtmRow): string {
  const c = COLUMNS[key]
  const v = r[key]
  if (c.type === 'date') return isoToDMY(String(v))
  if (c.type === 'amt') return formatAmount(v as number)
  if (c.type === 'rate') return v ? formatRate(v as number) : '0.000000'
  if (c.type === 'num') return String(v)
  return v === undefined || v === null ? '' : String(v)
}

export function visibleRows(
  rows: readonly MtmRow[],
  filters: Filters,
  search: string,
  sort: Sort,
  layoutId: string,
): MtmRow[] {
  let list = applyCriteria(rows, filters)
  const s = search.trim().toLowerCase()
  if (s) {
    const cols = layoutColumns(layoutId)
    list = list.filter((r) => cols.some((k) => cellText(k, r).toLowerCase().includes(s)))
  }
  if (sort.field) {
    const col = COLUMNS[sort.field]
    const sk = col.sortKey ?? sort.field
    const dir = sort.dir === 'asc' ? 1 : -1
    const numeric = col.type === 'amt' || col.type === 'rate' || col.type === 'num'
    list = [...list].sort((a, b) => {
      if (numeric) return (Number(a[sk]) - Number(b[sk])) * dir
      const x = String(a[sk])
      const y = String(b[sk])
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }
  return list
}

/** Clicking the sorted column flips it; any other column sorts ascending. */
export function nextSort(sort: Sort, field: ColumnKey): Sort {
  return sort.field === field ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page: number, total: number, size: number): number {
  return Math.min(page, pageCount(total, size))
}

export function showingText(page: number, size: number, total: number, shown: number): string {
  if (total <= 0) return ''
  const start = (page - 1) * size
  return `Showing ${start + 1}–${start + shown} of ${total}`
}

export function resultCountText(total: number): string {
  return `${total}${total === 1 ? ' transaction' : ' transactions'}`
}

export type EmptyState = { icon: string; title: string; text: string }

/** The placeholder shown instead of the table, or null when there are rows to show. */
export function emptyState(executed: boolean, loaded: number, total: number): EmptyState | null {
  if (!executed) {
    return { icon: '📊', title: 'Run the selection to view transactions', text: 'Choose Company Code and Key Date, then press Execute.' }
  }
  if (loaded === 0) {
    return { icon: '📄', title: 'No transactions found', text: 'No active FX transactions are valued for the selected company codes and Key Date.' }
  }
  if (total === 0) {
    return { icon: '🔎', title: 'No transactions match your search or filters', text: 'Adjust the filters or press Reset.' }
  }
  return null
}

// ------------------------------------------------------------------ popups

function item(label: string, value: string, full?: boolean): DetailItem {
  return full ? { label, value, full } : { label, value }
}

/** The accounting document popup (hotspot MTM_DOC / REV_DOC to FB03); null when the row has no such document. */
export function documentView(row: MtmRow, kind: 'MTM' | 'REV', keyISO: string): DocView | null {
  const reversal = kind === 'REV'
  const docNo = reversal ? row.rev_doc : row.mtm_doc
  if (!docNo) return null
  const cfg = findAccConfig(row.bukrs, glTypeOf(row), isNdf(row))
  const postDate = reversal ? addDaysISO(keyISO, 1) : keyISO
  const header = [
    item('Document Number', docNo),
    item('Company Code', `${row.bukrs} · ${row.butxt}`),
    item('Document Type', 'TR'),
    item('Currency', 'USD'),
    item('Document Date', isoToDMY(postDate)),
    item('Posting Date', isoToDMY(postDate)),
    item('Fiscal Year', postDate.slice(0, 4)),
    item('Reference', row.rfha),
  ]
  if (cfg) header.push(item('Header Text', cfg.doc_header, true))
  return {
    title: `${reversal ? 'Reversal Document ' : 'Accounting Document '}${docNo}`,
    banner: reversal ? `Reversal of MTM document ${row.mtm_doc} · reason 02` : 'MTM posting document',
    reversal,
    header,
    items: cfg ? buildPostingItems(row, cfg, reversal) : [],
  }
}

/** The transaction details popup (hotspot RFHA to ZSGSLCFM_DISPLAY). */
export function transactionView(row: MtmRow): TxnView {
  return {
    title: `Transaction ${row.rfha}`,
    general: [
      item('Company Code', `${row.bukrs} · ${row.butxt}`),
      item('Transaction', row.rfha),
      item('Ext. Reference', row.nordext),
      item('TSF Deal ID', row.ztsf_deal_id),
      item('Olam Deal No', row.zolam_deal_no),
      item('Product Type', `${row.sgsart} · ${row.xtext}`),
      item('Business Partner', row.kontrh),
      item('Partner Name', row.bp_name),
      item('Currency Pair', row.cpair),
      item('Trade Date', isoToDMY(row.dblfz)),
      item('Value Date', isoToDMY(row.delfz)),
      item('All-in Rate', formatRate(row.c_rate)),
    ],
    legs: [
      { head: `Leg 1 · ${row.bs_1}`, value: `${row.curr1} ${formatAmount(row.amt1)}` },
      { head: `Leg 2 · ${row.bs_2}`, value: `${row.curr2} ${formatAmount(row.amt2)}` },
    ],
    assignment: [
      item('Profit Center', `${row.prctr} · ${row.pc_name}`),
      item('Business Area', `${row.rbusa} · ${row.ba_name}`),
      item('Transaction Status', row.txn_status),
    ],
  }
}

export function confirmBody(keyISO: string): string {
  return `MTM documents will be posted for Key Date ${isoToDMY(keyISO)}. A reversal document dated ${isoToDMY(addDaysISO(keyISO, 1))} is posted automatically for each document.`
}

export function logCounts(msgs: readonly LogMsg[]): { ok: number; err: number } {
  const ok = msgs.filter((m) => m.type === 'S').length
  return { ok, err: msgs.length - ok }
}

// ------------------------------------------------------------------ calendar and floating panels

export function shiftMonth(v: CalendarView, delta: number): CalendarView {
  const d = new Date(v.year, v.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** Selectable years: six either side of the shown year and of the current one. */
export function calendarYears(viewYear: number, todayYear: number): number[] {
  const out: number[] = []
  for (let y = Math.min(viewYear, todayYear) - 6; y <= Math.max(viewYear, todayYear) + 6; y++) out.push(y)
  return out
}

/** The month grid: the previous month's tail, the days, then the next month's head to finish the week. */
export function calendarDays(v: CalendarView, selected: Date | null, today: Date): CalendarDay[] {
  const startOffset = new Date(v.year, v.month, 1).getDay()
  const dim = new Date(v.year, v.month + 1, 0).getDate()
  const prevDim = new Date(v.year, v.month, 0).getDate()
  const out: CalendarDay[] = []
  for (let i = 0; i < startOffset; i++) {
    out.push({ day: prevDim - startOffset + 1 + i, muted: true, selected: false, today: false })
  }
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(v.year, v.month, d)
    out.push({ day: d, muted: false, selected: !!selected && sameDay(dt, selected), today: sameDay(dt, today) })
  }
  const trailing = (7 - ((startOffset + dim) % 7)) % 7
  for (let i = 1; i <= trailing; i++) out.push({ day: i, muted: true, selected: false, today: false })
  return out
}

export { DAY_NAMES }

export type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }

/**
 * Where a fixed-position panel goes under (or, when it does not fit, above) its trigger, kept 8px
 * inside the window; alignRight lines its right edge up with the trigger's.
 */
export function floatingPosition(
  trigger: Box,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: { alignRight?: boolean | undefined; gap?: number | undefined } = {},
): { left: number; top: number } {
  const margin = 8
  const gap = opts.gap ?? 6
  let left = opts.alignRight ? trigger.right - panel.width : trigger.left
  const maxLeft = viewport.width - margin - panel.width
  if (left > maxLeft) left = maxLeft
  if (left < margin) left = margin
  let top = trigger.bottom + gap
  if (top + panel.height > viewport.height - margin) {
    const above = trigger.top - gap - panel.height
    top = above >= margin ? above : Math.max(margin, viewport.height - margin - panel.height)
  }
  return { left, top }
}
