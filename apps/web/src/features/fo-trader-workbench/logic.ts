/*
 * The Trader Workbench's business rules, ported function for function from
 * legacy/trader-workbench.html (which mirrors ZSGTSFR_SET_WSPACE). Pure: every function takes
 * the data it reads, and the mutations return a new AppData instead of editing in place.
 */
import { KPI_DUE_DAYS, LOOKUPS, mkTxn } from './data.ts'
import { dmyToIso, formatAmount, formatRate, isoToDMY, kpiCompact, parseDMY, todayIso } from './format.ts'
import type { ActionItem, AppData, Deal, Filters, InSpot, Sort, SpotDraft, StatusInfo, Txn, TxnRow } from './types.ts'

/* ---------------- lookups ---------------- */

export const modelDesc = (id: string) => LOOKUPS.models.find((m) => m.id === id)?.desc ?? ''
export const dealStatusInfo = (code: string): StatusInfo =>
  LOOKUPS.dealStatus.find((s) => s.code === code) ?? { code, desc: code, cls: 'status-text-draft' }
/** Whether a deal status counts as settled for the KPIs (DEAL_ST: "Settlement Completed …"). */
export const isClosedStatus = (code: string) => !!LOOKUPS.dealStatus.find((s) => s.code === code)?.closed
export const txnStatusInfo = (code: string): StatusInfo => LOOKUPS.txnStatus[code] ?? { desc: code, cls: 'status-text-draft' }
export const companyName = (code: string) => LOOKUPS.companies.find((c) => c.code === code)?.name ?? ''
export const bpName = (bp: string) => LOOKUPS.bps.find((b) => b.bp === bp)?.name ?? bp
export const txnTypeText = (sfhaart: string) => LOOKUPS.txnTypes[sfhaart] ?? ''

/** ZSGTRMFM_LEAD_CURR — lead / following currency of a pair (ranking is an assumption). */
export function leadCurr(c1: string, c2: string): { lead: string; follow: string } {
  const r = LOOKUPS.leadRank
  let i1 = r.indexOf(c1)
  let i2 = r.indexOf(c2)
  if (i1 < 0) i1 = 99
  if (i2 < 0) i2 = 99
  return i1 <= i2 ? { lead: c1, follow: c2 } : { lead: c2, follow: c1 }
}

/** Converts an amount using a rate quoted lead -> following. */
export function convertViaRate(amt: number, from: string, to: string, rate: number): number {
  if (!rate) return 0
  return leadCurr(from, to).lead === from ? amt * rate : amt / rate
}

/**
 * TCURR kurst M for a lead/follow pair on a date. TCURR keeps GDATU inverted, so the ABAP's
 * "gdatu >= <inverted date>" with SELECT SINGLE reads the latest rate dated on or before it.
 */
export function rateOn(lead: string, follow: string, isoDate: string): number {
  const rows = LOOKUPS.marketRates[`${lead}-${follow}`] || []
  let r = 0
  for (const row of rows) if (row.d <= isoDate) r = row.r
  return r
}

/** Today's market rate for a pair (the settlement spot and the KPIs' USD equivalents). */
export function spotRateFor(a: string, b: string, asOf: string = todayIso()): number {
  const lc = leadCurr(a, b)
  return rateOn(lc.lead, lc.follow, asOf)
}

/** OPTION_EXERCISE_EXPIRE: TCURR kurst M on the execution date. */
export function marketRate(txn: Txn): number {
  const lc = leadCurr(txn.curr1, txn.curr2)
  return txn.eDate ? rateOn(lc.lead, lc.follow, txn.eDate) : 0
}

/* ---------------- deal list (FETCH_DEAL_DETAILS) ---------------- */

export function fetchDeals(deals: readonly Deal[], f: Filters): Deal[] {
  const from = dmyToIso(f.from)
  const to = dmyToIso(f.to)
  if (!from || !to || from > to) return []
  return deals.filter((d) => {
    if (d.status === '30') return false /* DELETE ... zdeal_stat = '30' */
    if (f.status && d.status !== f.status) return false /* S_STAT */
    if (f.deal && d.id !== f.deal) return false /* S_DEAL */
    if (d.end > to) return false /* ze_date <= s_date-high */
    if (d.end < from && d.ss !== 'X') return false /* DELETE ze_date < s_date-low AND zss <> 'X' */
    if (f.model && d.model !== f.model) return false /* S_MOD */
    return true
  })
}

/** The deals the Deal ID filter offers: every deal that is not cancelled. */
export const dealOptions = (deals: readonly Deal[]) => deals.filter((d) => d.status !== '30')

export type DateErrors = { from: string; to: string }

export function dateErrors(f: Pick<Filters, 'from' | 'to'>): DateErrors {
  const df = parseDMY(f.from)
  const dt = parseDMY(f.to)
  return {
    from: !f.from ? 'Required' : !df ? 'Use dd-mm-yyyy' : '',
    to: !f.to ? 'Required' : !dt ? 'Use dd-mm-yyyy' : df && dt < df ? 'Before From date' : '',
  }
}

/* ---------------- main grid columns ---------------- */

export type DealCol = {
  key: string
  label: string
  pin?: boolean
  num?: boolean
  cls?: string
  /** Rendered as the coloured status text. */
  status?: boolean
  val: (d: Deal) => string | number
  text?: (d: Deal) => string
}

export const DEAL_COLS: readonly DealCol[] = [
  { key: 'id', label: 'Deal ID', pin: true, cls: 'mono strong', val: (d) => d.id },
  { key: 'desc', label: 'Description', val: (d) => d.desc },
  { key: 'model', label: 'Model', val: (d) => d.model },
  { key: 'modelDesc', label: 'Model Description', val: (d) => modelDesc(d.model) },
  { key: 'status', label: 'Status', status: true, val: (d) => dealStatusInfo(d.status).desc },
  { key: 'origin', label: 'Origin', val: (d) => d.origin },
  { key: 'mcRef', label: 'MC Reference', cls: 'mono', val: (d) => d.mcRef },
  { key: 'start', label: 'Start Date', cls: 'mono', val: (d) => d.start, text: (d) => isoToDMY(d.start) },
  { key: 'end', label: 'End Date', cls: 'mono', val: (d) => d.end, text: (d) => isoToDMY(d.end) },
  { key: 'mcCurr', label: 'MC Curr', val: (d) => d.mcCurr },
  { key: 'dealCurr', label: 'Deal Curr', val: (d) => d.dealCurr },
  { key: 'mcAmt', label: 'MC Amount', num: true, cls: 'mono', val: (d) => d.mcAmt, text: (d) => formatAmount(d.mcAmt) },
  { key: 'pl', label: 'P&L', num: true, cls: 'mono', val: (d) => d.pl, text: (d) => (d.pl ? formatAmount(d.pl) : '') },
  { key: 'plCurr', label: 'P&L Curr', val: (d) => (d.pl ? d.plCurr : '') },
  { key: 'plRate', label: 'P&L Rate', num: true, cls: 'mono', val: (d) => d.plRate, text: (d) => formatRate(d.plRate) },
  { key: 'plLocal', label: 'P&L (Local)', num: true, cls: 'mono', val: (d) => d.plLocal, text: (d) => (d.plLocal ? formatAmount(d.plLocal) : '') },
  { key: 'plLCurr', label: 'Local Curr', val: (d) => (d.plLocal ? d.plLCurr : '') },
  { key: 'trader', label: 'Trader Code', val: (d) => d.trader },
  { key: 'region', label: 'Region', val: (d) => d.region },
  { key: 'dealRef', label: 'Deal Ref', val: (d) => d.dealRef },
  { key: 'ss', label: 'Short Straddle', val: (d) => (d.ss === 'X' ? 'Yes' : '') },
]

export const colText = (c: DealCol, d: Deal) => (c.text ? c.text(d) : String(c.val(d) ?? ''))

/** The listed deals: selection logic, then the free-text search over every column, then the sort. */
export function filterSortDeals(deals: readonly Deal[], filters: Filters, search: string, sort: Sort): Deal[] {
  let list = fetchDeals(deals, filters)
  const q = search.trim().toLowerCase()
  if (q) list = list.filter((d) => DEAL_COLS.some((c) => colText(c, d).toLowerCase().includes(q)))
  const col = DEAL_COLS.find((c) => c.key === sort.field)
  if (col) {
    const dir = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const x = col.val(a)
      const y = col.val(b)
      if (col.num) return (Number(x) - Number(y)) * dir
      const xs = String(x).toLowerCase()
      const ys = String(y).toLowerCase()
      return xs < ys ? -dir : xs > ys ? dir : 0
    })
  }
  return list
}

export const nextSort = (s: Sort, field: string): Sort =>
  s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }

/* ---------------- transactions (FETCH_TXN_DATA) ---------------- */

/** One deal's transactions with the settlement-spot columns (SS rows only, as in the ABAP), by type. */
export function fetchTransactions(data: AppData, dealId: string): TxnRow[] {
  const out: TxnRow[] = []
  for (const t of data.txns) {
    if (t.dealId !== dealId) continue
    const row: TxnRow = { ...t, sdAmt: '', sdCurr: '', sdPending: false, sdDone: false }
    const ss = data.inSpot.find((s) => s.dealId === dealId && s.dealType === t.dealType && s.dssType !== '')
    if (ss) {
      row.sdAmt = ss.dAmt
      row.sdCurr = ss.curr
      if (ss.spotCreate === '') row.sdPending = true
      else row.sdDone = true
    }
    out.push(row)
  }
  return out.sort((a, b) => (a.sfhaart < b.sfhaart ? -1 : a.sfhaart > b.sfhaart ? 1 : 0))
}

/**
 * AUTHORITY-CHECK F_BKPF_BUK (ACTVT 03) for every company code of the deal. The browser has no
 * source for the user's authorisations (WAITING FOR AUTH), so without a list nothing is refused.
 */
export const isAuthorized = (txns: readonly Txn[], authorized: readonly string[] | null = null) =>
  authorized === null || txns.every((t) => authorized.includes(t.bukrs))

/** COLOR_DETAILS: green transaction number when status > 07, spot types 604/605/609, or settlement spot done. */
export function txnLinkClass(t: TxnRow): string {
  if (t.status > '07') return 'cell-green'
  if (t.sfhaart === '604' || t.sfhaart === '605' || t.sfhaart === '609') return 'cell-green'
  if (t.sdDone) return 'cell-green'
  return ''
}

/* ---------------- action items (PROCESS_ACTION_ITEMS + COLOR_CODE_ACTION_ITEMS) ---------------- */

const textFor = (sf: string, code: string) => LOOKUPS.actionTexts.find((a) => a.sf === sf && a.code === code) ?? null

export function fetchActionItems(data: AppData, deal: Deal, txns: readonly TxnRow[]): ActionItem[] {
  let items: ActionItem[] = txns.map((t) => ({
    dealId: deal.id,
    rfha: t.rfha,
    bukrs: t.bukrs,
    dealType: t.dealType,
    cpty: t.cptyName,
    sfhaart: t.sfhaart,
    valueDate: t.valueDate,
    eDate: t.eDate,
    status: t.status,
    curr1: t.curr1,
    amt1: t.amt1,
    curr2: t.curr2,
    pc1: t.pc1,
    bs1: t.bs1,
    coverTxn: t.coverTxn,
    text: '',
    textCode: '',
    bs: '',
    invAmt: '',
    invCurr: '',
    diffAmt: '',
    button: false,
    state: '',
  }))
  if (LOOKUPS.ruleBt[deal.fxInvModel.substring(0, 4)] === 'FX1') items = items.filter((i) => i.dealType !== 'DS1')

  const has64524 = items.some((i) => i.sfhaart === '645' && i.status === '24')
  const diffs = data.inSpot.filter((s) => s.dealId === deal.id)

  for (const it of items) {
    const a = textFor(it.sfhaart, it.status === '34' ? '02' : '01')
    if (a) {
      it.text = a.text
      it.textCode = a.code
    }
    if (has64524 && (it.dealType === 'DS1' || it.dealType === 'DS2')) {
      const b = textFor('619', '01')
      if (b) {
        it.text = b.text
        it.textCode = b.code
      }
    }
    if (deal.ss === 'X') {
      const c = textFor(it.sfhaart, '03')
      if (c) {
        it.text = c.text
        it.textCode = c.code
      }
    }
    let d: InSpot | null = null
    let spotDone = false
    for (const s of diffs) {
      if (s.dealType === it.dealType) {
        if (!d) d = s
        if (s.spotCreate === 'X') spotDone = true
      }
    }
    if (d) {
      it.invAmt = d.fAmt
      it.invCurr = d.curr
      it.bs = d.bs.charAt(0) === 'S' ? 'Sell' : d.bs /* IF bs+0(1) = 'S'. bs = 'Sell'. */
      it.diffAmt = d.dAmt
    }
    /* COLOR_CODE_ACTION_ITEMS */
    if (it.status > '07') it.state = 'done'
    else if (!spotDone) {
      it.state = 'pending'
      it.button = true
      if (deal.ss === 'X' && (it.dealType === '' || it.dealType === '00')) {
        if (items.some((o) => o.coverTxn === it.rfha)) {
          it.state = 'done'
          it.button = false
        }
      }
    } else it.state = 'done'
  }
  return items.filter((i) => i.textCode !== '')
}

export const inSpotFor = (data: AppData, dealId: string, dealType: string) =>
  data.inSpot.find((s) => s.dealId === dealId && s.dealType === dealType) ?? null

/** SELECT SINGLE zf_amt ... WHERE zdeal_type = … AND zrfha = space; deal type D3 is read as D2. */
export function invoiceAmountFor(data: AppData, dealId: string, dealType: string): InSpot | null {
  const dt = dealType === 'D3' ? 'D2' : dealType
  return data.inSpot.find((s) => s.dealId === dealId && s.dealType === dt && !s.rfha) ?? null
}

/**
 * PROCESS_SS_SPOT: ZSGTSFTR_SS_SPOT for the deal's model, the option side (645/646 -> 01,
 * 643 -> 02) and put/call (Put -> 1, Call -> 2). Null when no row matches, as in the ABAP.
 */
export function ssSpotFor(model: string, sfhaart: string, pc1: string) {
  const opBs = sfhaart === '645' || sfhaart === '646' ? '01' : sfhaart === '643' ? '02' : ''
  const pc = pc1 === 'Put' ? '1' : pc1 === 'Call' ? '2' : ''
  return LOOKUPS.ssSpot.find((r) => r.model === model && r.opBs === opBs && r.pc === pc) ?? null
}

/* ---------------- mutations (return a new AppData) ---------------- */

/**
 * A treasury transaction number repeats across company codes (deal 7000000055 holds SG03/3000000000037, deal 7000000060
 * holds IN11/3000000000037), so a number alone does not identify a transaction: it takes its deal or company code too.
 */
export type TxnScope = { dealId?: string; bukrs?: string }
export const inScope = (t: Pick<Txn, 'dealId' | 'bukrs'>, scope?: TxnScope): boolean =>
  (!scope?.dealId || t.dealId === scope.dealId) && (!scope?.bukrs || t.bukrs === scope.bukrs)

export function updateTxnStatus(data: AppData, rfha: string, status: string, extra?: Partial<Txn> | null, scope?: TxnScope): AppData {
  return { ...data, txns: data.txns.map((t) => (t.rfha === rfha && inScope(t, scope) ? { ...t, status, ...(extra ?? {}) } : t)) }
}

export function setCoverTxn(data: AppData, rfha: string, coverTxn: string): AppData {
  return { ...data, txns: data.txns.map((t) => (t.rfha === rfha ? { ...t, coverTxn } : t)) }
}

export function markSpotCreated(data: AppData, dealId: string, dealType: string, rfha: string): AppData {
  const dt = dealType === 'D3' ? 'D2' : dealType
  const target = inSpotFor(data, dealId, dt)
  if (!target) return data
  return {
    ...data,
    inSpot: data.inSpot.map((s) => (s === target ? { ...s, spotCreate: 'X', spotTxn: rfha || s.spotTxn } : s)),
  }
}

export type SpotRequest = {
  dealId: string
  dealType: string
  sourceRfha: string
  bukrs: string
  sfhaart: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  rate: number
  bp: string
  tradeDate?: string
  valueDate?: string
  text?: string
}

/** Books a spot (status 03) and marks the deal type's settlement spot as created. */
export function createSpotTransaction(data: AppData, p: SpotRequest, today: string): { data: AppData; rfha: string } {
  const nextRfha = data.nextRfha + 1
  const rfha = `17000${nextRfha}`
  const src = data.txns.find((t) => t.rfha === p.sourceRfha)
  const txn = mkTxn(p.dealId, rfha, {
    bukrs: p.bukrs,
    entity: src ? src.entity : 'OSIPL',
    sfhaart: p.sfhaart,
    sgsart: '12A',
    dealType: p.dealType,
    tradeDate: p.tradeDate || today,
    valueDate: p.valueDate || today,
    xtext: p.text || 'Spot',
    bs1: p.bs1,
    curr1: p.curr1,
    amt1: (p.bs1 === 'Sell' ? -1 : 1) * Math.abs(p.amt1),
    bs2: p.bs2,
    curr2: p.curr2,
    amt2: (p.bs2 === 'Sell' ? -1 : 1) * Math.abs(p.amt2),
    rate: p.rate,
    status: '03',
    cpty: p.bp,
    cptyName: bpName(p.bp),
    grp: src ? src.grp : 'G1',
    mcRef: src ? src.mcRef : '',
    seq: 99,
  })
  const next = { ...data, nextRfha, txns: [...data.txns, txn] }
  return { data: markSpotCreated(next, p.dealId, p.dealType, rfha), rfha }
}

/* ---------------- business calculations ---------------- */

/**
 * Exercise / expire decision (class ZSGTSFCL_GET_OPT_EXP_CALC is not part of the export —
 * assumption: a call is exercised when market > strike, a put when market < strike).
 */
export function decideExercise(txn: Pick<Txn, 'pc1' | 'strike'>, rate: number): '' | 'Exercise' | 'Expire' {
  if (!rate) return ''
  if (txn.pc1 === 'Call') return rate > txn.strike ? 'Exercise' : 'Expire'
  return rate < txn.strike ? 'Exercise' : 'Expire'
}

/** CASH_SETTLEMENT */
export function calcCashSettlement(txn: Txn, rate: number): number {
  if (!rate) return 0
  const lc = leadCurr(txn.curr1, txn.curr2)
  let cs: number
  if (lc.lead === 'USD') cs = lc.lead === txn.curr1 ? txn.amt2 / rate - txn.amt1 : txn.amt1 / rate - txn.amt2
  else cs = lc.lead === txn.curr1 ? rate * txn.amt1 - txn.amt2 : rate * txn.amt2 - txn.amt1
  cs = Math.abs(cs)
  if (txn.sfhaart === '648') cs = cs * -1 /* pay leg */
  return cs
}

/** CHECK_RATE — scale the fixing rate with the TCURF factors. */
export function scaledRate(txn: Txn, rate: number): number {
  const f = LOOKUPS.tcurf[`${txn.curr1}>${txn.curr2}`]
  if (f && f.ffact !== f.tfact) {
    if (f.ffact !== 1) return rate * f.ffact
    if (f.tfact !== 1) return rate * f.tfact
  }
  return rate
}

/** CASH_SETTELMENT (screen 9010). */
export function calcNdfSettlement(txn: Txn, fixRate: number): { ndf: number; dndf: number; scurr: string; scurr2: string } {
  const res = { ndf: 0, dndf: 0, scurr: '', scurr2: '' }
  const lr = scaledRate(txn, fixRate)
  const lc = leadCurr(txn.curr1, txn.curr2)
  const special = lc.follow === 'IDR' || lc.follow === 'VND' || lc.follow === 'TWD'
  res.scurr = txn.curr1 === 'USD' || txn.curr2 === 'USD' ? 'USD' : lc.follow
  if (fixRate && lr) {
    if (txn.curr1 === lc.follow) res.ndf = special ? txn.amt2 + (txn.amt1 * 100) / lr : txn.amt2 + txn.amt1 / lr
    else res.ndf = special ? txn.amt1 + (txn.amt2 * 100) / lr : txn.amt1 + txn.amt2 / lr
  }
  if (txn.sfhaart === '632' && lr) {
    if (txn.curr1 !== 'USD') res.dndf = Math.abs(txn.amt1 * 100) - Math.abs(txn.amt2) * lr
    else res.dndf = Math.abs(txn.amt2 * 100) - Math.abs(txn.amt1) * lr
  }
  res.dndf = Math.abs(res.dndf) / 100
  res.scurr2 = lc.follow
  return res
}

/** RBI default fixing rate: only for pair USD:INR on the fixing date. */
export function defaultFixingRate(txn: Txn): number {
  if (txn.cpair !== 'USD:INR') return 0
  return LOOKUPS.rbiRates[txn.ndfDate] || 0
}

/** Recalculates the dependent amount when the rate is edited (same rules as the PBO modules). */
export function recalcSpotAmounts(s: SpotDraft): SpotDraft {
  const n = { ...s }
  if (!n.rate) {
    if (n.base === 2) n.amt1 = 0
    else n.amt2 = 0
    return n
  }
  if (n.base === 2) n.amt1 = n.curr2 === 'USD' ? n.amt2 * n.rate : n.amt2 / n.rate
  else n.amt2 = n.curr1 === 'USD' ? n.amt1 * n.rate : n.amt1 / n.rate
  return n
}

/** Screen 9011 CO_CODE_NDF / PROCESS_NDF_SPOT: invoice entity, amount and side, never the parent NDF's notional. */
export function buildNdfSpot(txn: Txn, invoice: InSpot | null): SpotDraft {
  // The invoice supplies the fixed amount and direction, not the source pair.
  // Keep both currencies visible while the invoice settlement is still missing.
  if (!invoice?.curr) return {
    bukrs: '', bp: txn.cpty,
    curr1: txn.curr1, curr2: txn.curr2, bs1: 'Buy', bs2: 'Sell',
    amt1: 0, amt2: 0, base: 1, rate: 0, invText1: '', invText2: '',
  }
  const buying = invoice?.bs === 'Buy'
  const currency = invoice?.curr ?? ''
  const other = txn.curr1 === currency ? txn.curr2 : txn.curr1
  return {
    bukrs: invoice ? LOOKUPS.companies.find((c) => c.entity === invoice.entity)?.code ?? '' : '',
    bp: txn.cpty,
    curr1: buying ? currency : other,
    curr2: buying ? other : currency,
    bs1: 'Buy',
    bs2: 'Sell',
    amt1: buying ? Math.abs(invoice?.fAmt ?? 0) : 0,
    amt2: buying ? 0 : Math.abs(invoice?.fAmt ?? 0),
    base: buying ? 1 : 2,
    rate: 0,
    invText1: buying && invoice?.fAmt ? 'Invoice Value' : '',
    invText2: !buying && invoice?.fAmt ? 'Invoice Value' : '',
  }
}

/** Explain missing prerequisites before displaying an NDF spot as ready to book. */
export function ndfSpotIssue(txn: Txn, invoice: InSpot | null): string {
  if (!invoice) return 'No invoice settlement details are saved for this deal type. Save the FX–Invoice Difference on MO: Execute Settlement, then reopen Create Spot.'
  if (!txn.curr1 || !txn.curr2 || txn.curr1 === txn.curr2) return 'The source NDF currency pair is incomplete. Refresh the workbench before creating its spot.'
  if (!invoice.curr || ![txn.curr1, txn.curr2].includes(invoice.curr)) return 'The saved invoice currency is missing or does not match the NDF currency pair. Correct the FX–Invoice Difference on MO: Execute Settlement, then reopen Create Spot.'
  if (invoice.bs !== 'Buy' && invoice.bs !== 'Sell') return 'The saved invoice buy/sell direction is missing. Save the FX–Invoice Difference on MO: Execute Settlement, then reopen Create Spot.'
  if (!Number.isFinite(invoice.fAmt) || !invoice.fAmt) return 'No invoice amount is available for this NDF. Save the FX–Invoice Difference on MO: Execute Settlement, then reopen Create Spot.'
  if (!invoice.entity || !LOOKUPS.companies.some((c) => c.entity === invoice.entity)) return 'The saved invoice entity has no company code. Correct its company configuration, then refresh the workbench.'
  return ''
}

/** PROCESS_NDO_SPOT / NDO_SPOT — default values for the "Create Spot" popup. */
export function buildNdoSpot(txn: Txn, ctx: { invoice: InSpot | null; rate: number }): SpotDraft {
  let s: SpotDraft = {
    bukrs: '',
    curr1: '',
    bs1: '',
    amt1: 0,
    curr2: '',
    bs2: '',
    amt2: 0,
    rate: 0,
    bp: txn.cpty,
    invText1: '',
    invText2: '',
    base: 1,
  }
  const inv = ctx.invoice
  s.rate = txn.strike || ctx.rate || 0
  if (!inv) {
    const sf = txn.sfhaart
    const typ = sf === '645' || sf === '647' ? (txn.pc1 === 'Put' ? '2' : '1') : txn.pc1 === 'Put' ? '1' : '2'
    const lc = leadCurr(txn.curr1, txn.curr2)
    s.curr1 = lc.lead
    s.curr2 = lc.follow
    if (typ === '1' || lc.lead === txn.curr2) {
      s.bs1 = 'Buy'
      s.bs2 = 'Sell'
    } else {
      s.bs1 = 'Sell'
      s.bs2 = 'Buy'
    }
    s.amt1 = txn.curr1 === 'USD' ? txn.amt1 : txn.amt2
    s.amt2 = s.curr1 === 'USD' ? s.amt1 * s.rate : s.rate ? s.amt1 / s.rate : 0
  } else {
    const amtAbs = Math.abs(inv.fAmt)
    s.bs1 = 'Buy'
    s.bs2 = 'Sell'
    if (inv.bs === 'Buy') {
      s.curr1 = inv.curr
      s.curr2 = txn.curr1 === inv.curr ? txn.curr2 : txn.curr1
      s.amt1 = amtAbs
      s.invText1 = 'Invoice Value'
      s.base = 1
    } else {
      s.curr1 = txn.curr1 === inv.curr ? txn.curr2 : txn.curr1
      s.curr2 = inv.curr
      s.amt2 = amtAbs
      s.invText2 = 'Invoice Value'
      s.base = 2
    }
    s = recalcSpotAmounts(s)
  }
  const comp = LOOKUPS.companies.find((c) => c.entity === txn.entity)
  s.bukrs = comp ? comp.code : txn.bukrs
  return s
}

/** The business partners of a trader group, once each. */
export function bpItemsForGroup(grp: string) {
  const seen = new Set<string>()
  return LOOKUPS.bps.filter((b) => b.grp === grp && !seen.has(b.bp) && seen.add(b.bp))
}

/* ---------------- KPIs (computeKpis) ---------------- */

export function kpiDaysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00`)
  const b = new Date(`${bIso}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function kpiToUsd(amt: number, curr: string, asOf: string = todayIso()): number {
  if (!amt) return 0
  if (curr === 'USD') return amt
  const r = spotRateFor(curr, 'USD', asOf)
  return r ? convertViaRate(amt, curr, 'USD', r) : 0
}

export type Kpis = {
  deals: Deal[]
  count: number
  notionalUsd: number
  byStatus: Record<string, number>
  byModel: Record<string, number>
  due: { deal: Deal; days: number }[]
  overdue: { deal: Deal; days: number }[]
  pendingItems: { deal: Deal; item: ActionItem }[]
  doneItems: number
  noAuth: Deal[]
  perDealProgress: { deal: Deal; pending: number; done: number }[]
  pl: { deal: Deal; usd: number }[]
  plTotal: number
  gains: number
  losses: number
  progressPct: number
  totalItems: number
}

export function computeKpis(data: AppData, deals: readonly Deal[], asOf: string = todayIso()): Kpis {
  const k: Kpis = {
    deals: [...deals],
    count: deals.length,
    notionalUsd: 0,
    byStatus: {},
    byModel: {},
    due: [],
    overdue: [],
    pendingItems: [],
    doneItems: 0,
    noAuth: [],
    perDealProgress: [],
    pl: [],
    plTotal: 0,
    gains: 0,
    losses: 0,
    progressPct: 0,
    totalItems: 0,
  }
  for (const d of deals) {
    k.notionalUsd += kpiToUsd(d.mcAmt, d.mcAmtCurr, asOf)
    const st = dealStatusInfo(d.status).desc
    k.byStatus[st] = (k.byStatus[st] || 0) + 1
    k.byModel[d.model] = (k.byModel[d.model] || 0) + 1

    const left = kpiDaysBetween(asOf, d.end)
    const open = !isClosedStatus(d.status)
    if (open && left >= 0 && left <= KPI_DUE_DAYS) k.due.push({ deal: d, days: left })
    if (open && left < 0) k.overdue.push({ deal: d, days: -left })

    if (d.pl) {
      const usd = kpiToUsd(d.pl, d.plCurr, asOf)
      k.pl.push({ deal: d, usd })
      k.plTotal += usd
      if (usd >= 0) k.gains++
      else k.losses++
    }

    const txns = fetchTransactions(data, d.id)
    if (!isAuthorized(txns)) {
      k.noAuth.push(d)
      continue
    }
    let p = 0
    let dn = 0
    for (const it of fetchActionItems(data, d, txns)) {
      if (it.state === 'pending') {
        p++
        k.pendingItems.push({ deal: d, item: it })
      } else if (it.state === 'done') {
        dn++
        k.doneItems++
      }
    }
    if (p + dn) k.perDealProgress.push({ deal: d, pending: p, done: dn })
  }
  k.due.sort((a, b) => a.days - b.days)
  k.overdue.sort((a, b) => b.days - a.days)
  const tot = k.pendingItems.length + k.doneItems
  k.progressPct = tot ? Math.round((k.doneItems / tot) * 100) : 0
  k.totalItems = tot
  return k
}

export type KpiId = 'deals' | 'due' | 'overdue' | 'pending' | 'progress' | 'pl'

export type KpiDef = {
  id: KpiId
  label: string
  tone: '' | 'warn' | 'bad' | 'good'
  value: (k: Kpis) => string
  valueCls?: (k: Kpis) => string
  desc: (k: Kpis) => string
}

export const KPI_DEFS: readonly KpiDef[] = [
  {
    id: 'deals',
    label: 'Deals in Scope',
    tone: '',
    value: (k) => String(k.count),
    desc: (k) => (k.count ? `≈ USD ${kpiCompact(k.notionalUsd)} notional` : 'No deals listed'),
  },
  {
    id: 'due',
    label: `Due in ${KPI_DUE_DAYS} Days`,
    tone: 'warn',
    value: (k) => String(k.due.length),
    desc: (k) => (k.due.length ? `Next: ${k.due[0]!.deal.id} · ${isoToDMY(k.due[0]!.deal.end)}` : 'Nothing due soon'),
  },
  {
    id: 'overdue',
    label: 'Overdue',
    tone: 'bad',
    value: (k) => String(k.overdue.length),
    desc: (k) => (k.overdue.length ? `Oldest: ${k.overdue[0]!.days} days late` : 'All on schedule'),
  },
  {
    id: 'pending',
    label: 'Pending Actions',
    tone: 'warn',
    value: (k) => String(k.pendingItems.length),
    desc: (k) => {
      const n = new Set(k.pendingItems.map((p) => p.deal.id)).size
      return k.pendingItems.length ? `across ${n}${n === 1 ? ' deal' : ' deals'}` : 'Nothing awaiting action'
    },
  },
  {
    id: 'progress',
    label: 'Settlement Progress',
    tone: 'good',
    value: (k) => (k.totalItems ? `${k.progressPct}%` : '–'),
    desc: (k) => (k.totalItems ? `${k.doneItems} of ${k.totalItems} actions done` : 'No action items'),
  },
  {
    id: 'pl',
    label: 'Net P&L (USD)',
    tone: '',
    value: (k) => (k.plTotal > 0 ? '+' : '') + kpiCompact(k.plTotal),
    valueCls: (k) => (k.plTotal > 0 ? 'kpi-pos' : k.plTotal < 0 ? 'kpi-neg' : ''),
    desc: (k) => (k.pl.length ? `${k.gains} gain · ${k.losses} loss` : 'No P&L booked'),
  },
]

/** Counts, largest first (ties by label). */
export function kpiCountRows(obj: Record<string, number>): { label: string; value: number; text: string }[] {
  return Object.keys(obj)
    .sort((a, b) => obj[b]! - obj[a]! || (a < b ? -1 : 1))
    .map((key) => ({ label: key, value: obj[key]!, text: String(obj[key]) }))
}
