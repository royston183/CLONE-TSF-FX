import {
  ACC_CATEGORIES,
  BUSINESS_AREAS,
  COLUMNS,
  COMPANIES,
  DEAL_SEEDS,
  DEFAULTS,
  EXT_FX,
  FIRST_DOC_NO,
  MONTH_SHORT,
  MTM_MAX_MONTHS,
  MTM_WINDOW_DAYS,
  PAIRS,
  PARTNERS,
  POSTED_HISTORY,
  PROFIT_CENTERS,
  STATUSES,
  SWAP_TENORS,
  SYSTEM_DATE,
  TEXTS,
  TXN_TYPE_TEXT,
} from './data.ts'
import {
  addDaysYmd,
  dayNumber,
  dmyToYmd,
  formatAmount,
  formatRate,
  isMonthEndYmd,
  lastDayOfMonth,
  pad2,
  parseDMY,
  roundTo,
  weekdayOf,
  ymdToDmy,
} from './format.ts'
import type {
  AccCat,
  AccountingDocument,
  AccountingRow,
  Column,
  Company,
  Deal,
  DealBase,
  DealSeed,
  DocHeader,
  Executed,
  Filters,
  MarketData,
  MonthBucket,
  MsgRow,
  Pair,
  ParamErrors,
  Params,
  PostedRecord,
  PostingContext,
  Side,
  Sort,
  Store,
  SwapPoint,
} from './types.ts'

/*
 * Business logic ported from ZSGTSF_RMTM_FX_EXT: GET_DATA, SWAP, GET_MTM_MONTH_DAYS,
 * POST_DOCUMNET, DEBIT, CREDIT, BAPI_POST, REVERSAL_POSTING, ALL_POSTING. Pure: no DOM, no React.
 */

export const DEFAULT_FILTERS: Filters = { dealFrom: '', dealTo: '', bpFrom: '', bpTo: '', pair: '', dealType: 'all', source: 'DE6' }
export const DEFAULT_SORT: Sort = { field: 'rfha', dir: 'asc' }

// ------------------------------------------------------------------ master data lookups

export function getCompany(code: string): Company | null {
  return COMPANIES.find((c) => c.code === code) ?? null
}

/** ZGTCATR_PARAM mapid 'A': the company has a local currency, so the DE2/DE6 split and THB column apply. */
export function isTh10Mode(bukrs: string): boolean {
  const c = getCompany(bukrs)
  return !!(c && c.localCurrency)
}

function pairOf(code: string): Pair {
  const p = PAIRS.find((x) => x.code === code)
  if (!p) throw new Error(`Unknown currency pair ${code}`)
  return p
}

/** Decimals a rate is shown with: always four, whatever the pair. */
export function rateDp(_r: Pick<Deal, 'cpair'>): number {
  return 4
}

/** Decimals swap points are shown with: one more than the pair's (never fewer than four). */
export function swapDp(r: Pick<Deal, 'cpair'>): number {
  const p = PAIRS.find((x) => x.code === r.cpair)
  return Math.max(p ? p.dp : 4, 4) + 1
}

// ------------------------------------------------------------------ mock market data
// Replaces ZSGTRMCDS_SPOT_MAIN / ZSGTRMCDS_SWAP_MAIN. Deterministic: a date always gives the same rates.

export function mockSpot(pairCode: string, ymd: string): number {
  const p = pairOf(pairCode)
  const d = dayNumber(ymd)
  const d0 = dayNumber('20260101')
  const wave = 0.016 * Math.sin(d / 41 + p.phase) + 0.005 * Math.sin(d / 9 + p.phase * 2)
  return roundTo(p.base * (1 + wave + p.trend * (d - d0)), p.dp)
}

export function mockSwapCurve(pairCode: string, ymd: string): SwapPoint[] {
  const p = pairOf(pairCode)
  const d = dayNumber(ymd)
  const adj = 1 + 0.04 * Math.sin(d / 50 + p.phase)
  return SWAP_TENORS.map((days) => ({ dlfz: days, kkurs: roundTo((p.perYear * days) / 365 * adj, p.dp + 1) }))
}

export function loadMarketData(keyYmd: string): MarketData {
  const m: MarketData = { spots: {}, swaps: {} }
  for (const p of PAIRS) {
    m.spots[p.code] = mockSpot(p.code, keyYmd)
    m.swaps[p.code] = mockSwapCurve(p.code, keyYmd)
  }
  return m
}

// ------------------------------------------------------------------ deal generator
// zsgtsfcds_fx / zsgtsfcds_fx_trm. Contract rate = spot at trade date + forward points for the
// tenor, +/- a small deterministic jitter, i.e. what would have been dealt.

/** -1..1, deterministic from n. */
export function jitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

export function nextBusinessDayBack(ymd: string, n: number): string {
  let cur = ymd
  let left = n
  while (left > 0) {
    cur = addDaysYmd(cur, -1)
    const wd = weekdayOf(cur)
    if (wd !== 0 && wd !== 6) left--
  }
  return cur
}

/** seedIndex is the deal's 1-based position in the book; it seeds the contract-rate jitter. */
export function buildDeal(seed: DealSeed, seedIndex: number): DealBase {
  const [rfha, bukrs, src, tsf, status, bpId, pairCode, side, notional, trade, value, kind, accCat] = seed
  const p = pairOf(pairCode)
  const tenor = dayNumber(value) - dayNumber(trade)
  const fwdPts = (p.perYear * tenor) / 365
  const rate = roundTo((mockSpot(pairCode, trade) + fwdPts) * (1 + jitter(seedIndex) * 0.0035), p.dp)
  const isNdf = kind === 'NDF'
  const sfhaart = isNdf ? (src === 'TSF' ? '631' : '630') : src === 'TSF' ? '625' : '620'
  const sgsart = isNdf ? '12D' : '12F'
  const partner = PARTNERS.find((x) => x.id === bpId)
  const comp = COMPANIES.find((c) => c.code === bukrs)
  if (!partner || !comp) throw new Error(`Unknown partner or company on deal ${rfha}`)
  const amt1 = (side === 'Buy' ? 1 : -1) * notional
  const amt2 = -amt1 * rate
  let ndfDate = ''
  let ndfRate = 0
  if (isNdf) {
    ndfDate = nextBusinessDayBack(value, 2)
    // The settlement rate only exists once the fixing date has passed.
    if (dayNumber(ndfDate) <= dayNumber(SYSTEM_DATE)) ndfRate = mockSpot(pairCode, ndfDate)
  }
  const accCategory: AccCat = accCat
  const bs2: Side = side === 'Buy' ? 'Sell' : 'Buy'
  return {
    bukrs,
    butxt: comp.name,
    rfha,
    src,
    tsf_code: tsf,
    txn_status: status,
    kontrh: bpId,
    bp_name: partner.name,
    country: partner.country,
    cpair: pairCode,
    f_curr1: p.f,
    t_curr1: p.t,
    curr1: p.f,
    curr2: p.t,
    amt1,
    amt2,
    c_rate: rate,
    bs_1: side,
    bs_2: bs2,
    bs_o: side === 'Sell' ? '1' : '2',
    sfhaart,
    sgsart,
    xtext: sfhaart + ' - ' + (TXN_TYPE_TEXT[sfhaart] ?? ''),
    dblfz: trade,
    delfz: value,
    ndf_date: ndfDate,
    ndf_rate: ndfRate,
    ndf_ref: isNdf ? 'NDF/' + bukrs + '/' + rfha.slice(4) : '',
    zsett_pair: isNdf ? pairCode : '',
    prctr: PROFIT_CENTERS[bukrs] ?? '',
    rbusa: BUSINESS_AREAS[bukrs] ?? '',
    rportb: accCategory,
    xportb: ACC_CATEGORIES[accCat] ?? '',
    refer: accCat === 'FV' ? 'TRD01' : 'HDG01',
    ztsf_deal_id: src === 'TSF' ? 'TSF/' + bukrs.slice(0, 2) + '/2026/' + rfha.slice(5) : '',
    zolam_deal_no: 'OLM-' + rfha.slice(3),
  }
}

/** Every deal in the system. */
export function loadAllDeals(): DealBase[] {
  return DEAL_SEEDS.map((seed, i) => buildDeal(seed, i + 1))
}

// ------------------------------------------------------------------ accounting determination

/**
 * ZSGTRMTR_ACC_TBL, built per company with dummy GL numbers. VN10 intentionally has no
 * 'External / Loss / Cash Traded' row, so posting such a deal exercises the BAPI error path.
 */
export function buildAccountingTable(): AccountingRow[] {
  const rows: AccountingRow[] = []
  const glAsset = { T: '15800400', E_FV: '15800100', E_CT: '15800200', E_NDF: '15800300' }
  const glLiab = { T: '25800400', E_FV: '25800100', E_CT: '25800200', E_NDF: '25800300' }
  const pnlGain = { T: '78100400', E_FV: '78100100', E_CT: '78100200', E_NDF: '78100300' }
  const pnlLoss = { T: '78200400', E_FV: '78200100', E_CT: '78200200', E_NDF: '78200300' }
  type Key = keyof typeof glAsset
  const add = (bukrs: string, intExt: 'T' | 'E', type: 'MG' | 'ML', ndf: '' | 'X', accCat: string, key: Key, label: string) => {
    const gain = type === 'MG'
    rows.push({
      zbukrs: bukrs,
      int_ext: intExt,
      type,
      zndf: ndf,
      acc_cat: accCat,
      gl_debit: gain ? glAsset[key] : pnlLoss[key],
      gl_credit: gain ? pnlGain[key] : glLiab[key],
      pc_debit: '',
      ba_debit: '',
      pc_credit: '',
      ba_credit: '',
      doc_debit: gain ? 'MTM Asset' : 'MTM Loss',
      doc_credit: gain ? 'MTM Gain' : 'MTM Liability',
      doc_header: 'FX MTM ' + label + (gain ? ' Gain' : ' Loss'),
    })
  }
  for (const c of COMPANIES) {
    for (const t of ['MG', 'ML'] as const) {
      add(c.code, 'T', t, '', '', 'T', 'TSF')
      add(c.code, 'T', t, 'X', '', 'T', 'TSF NDF')
      add(c.code, 'E', t, 'X', '', 'E_NDF', 'External NDF')
      add(c.code, 'E', t, '', 'FV', 'E_FV', 'External FV')
      if (!(c.code === 'VN10' && t === 'ML')) add(c.code, 'E', t, '', 'CT', 'E_CT', 'External CT')
    }
  }
  return rows
}

export const ACCOUNTING_TABLE: readonly AccountingRow[] = buildAccountingTable()

// ------------------------------------------------------------------ GET_MTM_MONTH_DAYS / SWAP

/** The 60 month-end buckets after the key date. */
export function buildMtmMonths(keyYmd: string): MonthBucket[] {
  let y = +keyYmd.slice(0, 4)
  let m = +keyYmd.slice(4, 6)
  const list: MonthBucket[] = []
  for (let i = 1; i <= MTM_MAX_MONTHS; i++) {
    m++
    if (m > 12) {
      m = 1
      y++
    }
    const endYmd = String(y) + pad2(m) + pad2(lastDayOfMonth(y, m))
    list.push({ zmonth: i, zmonth_date: endYmd, zmonth_days: dayNumber(endYmd) - dayNumber(keyYmd) + 1 })
  }
  return list
}

export function monthBucketOf(valueYmd: string, months: readonly MonthBucket[]): MonthBucket | null {
  return months.find((b) => b.zmonth_date.slice(0, 6) === valueYmd.slice(0, 6)) ?? null
}

/** SWAP: the interpolated swap points for one deal. */
export function computeSwapRate(
  valueYmd: string,
  keyYmd: string,
  months: readonly MonthBucket[],
  curve: readonly SwapPoint[],
): { month: number; rate: number } {
  const bucket = monthBucketOf(valueYmd, months)
  const swap = { month: 0, rate: 0 }
  if (bucket) swap.month = bucket.zmonth
  const noDays = bucket ? dayNumber(bucket.zmonth_date) - dayNumber(keyYmd) : 0

  const rows = curve.filter((r) => r.dlfz > 15).sort((a, b) => a.dlfz - b.dlfz)
  let low: SwapPoint | null = null
  let high: SwapPoint | null = null
  let flag = false
  for (const r of rows) {
    if (r.dlfz <= noDays) {
      low = r
    } else if (!low) {
      low = r
    } else if (!flag) {
      high = r
      flag = true
    }
    if (low && high) break
  }
  const lowDate = low ? dayNumber(keyYmd) + low.dlfz : dayNumber(keyYmd)
  const highDate = high ? dayNumber(keyYmd) + high.dlfz : dayNumber(keyYmd)

  let bucketLow = 0
  let bucketHigh = 0
  for (const b of months) {
    const mEnd = dayNumber(b.zmonth_date)
    const lo = mEnd - MTM_WINDOW_DAYS
    const hi = mEnd + MTM_WINDOW_DAYS
    if (!bucketLow && lowDate >= lo && lowDate <= hi) bucketLow = b.zmonth
    if (!bucketHigh && highDate >= lo && highDate <= hi) bucketHigh = b.zmonth
    if (bucketLow && bucketHigh) break
  }
  if (!bucketHigh) bucketHigh = bucketLow

  const kLow = low ? low.kkurs : 0
  const kHigh = high ? high.kkurs : 0
  const mth = swap.month
  if (mth === bucketLow) {
    swap.rate = kLow
  } else if (mth === bucketHigh) {
    swap.rate = kHigh
  } else if (mth > bucketLow && mth <= bucketHigh) {
    const times = bucketHigh - bucketLow
    const perMonth = times ? (kHigh - kLow) / times : 0
    swap.rate = kLow + perMonth * (mth - bucketLow)
  } else if (mth > bucketHigh) {
    swap.rate = kLow
  }
  return swap
}

// ------------------------------------------------------------------ GET_DATA

type SignInput = Pick<
  Deal,
  'sgsart' | 'ndf_rate' | 'ndf_date' | 'delfz' | 'v_gl' | 'f_curr' | 'f_curr1' | 'curr1' | 'bs_1' | 'bs_2' | 'c_rate_n' | 'v_rate_n'
>

/** Valuation Gain/Loss sign rules (end of the GET_DATA loop). */
export function applyGainLossSign(r: SignInput, keyYmd: string): number {
  const isNdfFixed = r.sgsart === '12D' && r.ndf_rate !== 0
  const beforeFixing = dayNumber(keyYmd) < dayNumber(r.ndf_date || '00000101') && dayNumber(keyYmd) < dayNumber(r.delfz)
  let gl = Math.abs(r.v_gl)
  if (r.f_curr === r.f_curr1) gl = -gl // foreign currency is the leading currency
  const bs = r.curr1 === r.f_curr ? r.bs_1 : r.bs_2
  const cRate = r.c_rate_n
  let compareRate = r.v_rate_n // default comparison: contract vs value rate
  if (isNdfFixed && !beforeFixing) compareRate = r.ndf_rate // fixed NDF: contract vs NDF settlement rate
  const rateNotAbove = cRate <= compareRate
  if (bs === 'Buy') {
    if (rateNotAbove) gl = -gl
  } else if (!rateNotAbove) {
    gl = -gl
  }
  return gl
}

/** GET_DATA loop body: valuate one deal for a key date. */
export function valuateDeal(
  d: DealBase,
  keyYmd: string,
  months: readonly MonthBucket[],
  market: MarketData,
  posted: PostedRecord | null,
): Deal {
  // foreign currency / amount (the non-USD leg)
  const fCurr = d.curr1 !== 'USD' ? d.curr1 : d.curr2
  const fAmt = Math.abs(d.curr1 !== 'USD' ? d.amt1 : d.amt2)

  // amount in USD at the contract rate
  let usdAmt = 0
  if (d.f_curr1 !== 'USD') usdAmt = fAmt * d.c_rate
  else if (d.c_rate) usdAmt = fAmt / d.c_rate
  usdAmt = roundTo(usdAmt, 4)

  // valuation spot / swap / rate (no tcurf factors in the dummy currencies, so *_n equals base)
  const vSpot = market.spots[d.cpair] ?? 0
  const sw = computeSwapRate(d.delfz, keyYmd, months, market.swaps[d.cpair] ?? [])
  const vRate = vSpot + sw.rate

  // valuation amount
  const useNdfRate = d.sgsart === '12D' && d.ndf_rate !== 0
  const beforeFix = dayNumber(keyYmd) < dayNumber(d.ndf_date || '00000101') && dayNumber(keyYmd) < dayNumber(d.delfz)
  let vAmt = 0
  if (useNdfRate) {
    if (d.f_curr1 !== 'USD') {
      vAmt = fAmt * d.ndf_rate
      if (beforeFix) vAmt = fAmt * vRate
    } else {
      vAmt = fAmt / d.ndf_rate
      if (beforeFix && vRate) vAmt = fAmt / vRate
    }
  } else if (d.f_curr1 !== 'USD') {
    vAmt = fAmt * vRate
  } else if (vRate) {
    vAmt = fAmt / vRate
  }
  vAmt = roundTo(vAmt, 2)

  // valuation gain / loss
  const rawGl = vAmt ? roundTo(vAmt - usdAmt, 2) : 0
  const r: Deal = {
    ...d,
    ext_stat_desc: d.txn_status + ' - ' + (STATUSES[d.txn_status] ?? ''),
    landx50: d.country,
    f_curr: fCurr,
    f_amt: fAmt,
    bs_bu: d.bs_o === '1' ? 'Sell' : 'Buy',
    mtm_doc: posted ? posted.doc : '',
    rev_doc: posted ? posted.rev : '',
    msg: posted ? posted.msg : '',
    usd_amt: usdAmt,
    v_spot: vSpot,
    v_swap: sw.rate,
    monat: sw.month,
    v_rate: vRate,
    c_rate_n: d.c_rate,
    v_spot_n: vSpot,
    v_swap_n: sw.rate,
    v_rate_n: vRate,
    v_amt: vAmt,
    v_gl: rawGl,
    v_gl_th: 0,
    month: (MONTH_SHORT[+d.delfz.slice(4, 6) - 1] ?? '') + ' ' + d.delfz.slice(0, 4),
  }
  let gl = roundTo(applyGainLossSign(r, keyYmd), 2)
  if (gl === 0) gl = 0 // normalise -0
  r.v_gl = gl
  r.v_gl_th = roundTo(gl * vRate, 2) // THB value for TH10
  return r
}

/** Selection logic of GET_DATA: which deals are in scope for a company and key date (trade date <= key date < value date). */
export function valuateDealsFor(bukrs: string, keyYmd: string, store: Store): Deal[] {
  const months = buildMtmMonths(keyYmd)
  const market = loadMarketData(keyYmd)
  const rows: Deal[] = []
  for (const d of loadAllDeals()) {
    if (d.bukrs !== bukrs) continue
    if (!(dayNumber(d.dblfz) <= dayNumber(keyYmd) && dayNumber(d.delfz) > dayNumber(keyYmd))) continue
    rows.push(valuateDeal(d, keyYmd, months, market, loadPostedRecord(store, d.bukrs, d.rfha, keyYmd)))
  }
  return rows.sort((a, b) => (a.rfha < b.rfha ? -1 : a.rfha > b.rfha ? 1 : 0))
}

/** Selection criteria applied after valuation (S_RFHA, S_BP, P_CURR, RR1/RR2/RR3, R1/R2). */
export function applySelectionCriteria(rows: readonly Deal[], f: Filters, bukrs: string): Deal[] {
  return rows.filter((r) => {
    if (f.dealFrom && r.rfha < f.dealFrom) return false
    if (f.dealTo && r.rfha > f.dealTo) return false
    if (f.bpFrom && r.kontrh < f.bpFrom) return false
    if (f.bpTo && r.kontrh > f.bpTo) return false
    if (f.pair && r.cpair !== f.pair) return false
    if (f.dealType === 'ndf' && r.sfhaart !== '630' && r.sfhaart !== '631') return false
    // ABAP quirk kept as in source: for "Deliverable Deals" the DELETE condition is
    // "sfhaart = 630 AND sfhaart = 631", which can never be true, so nothing is removed.
    if (isTh10Mode(bukrs)) {
      if (f.source === 'DE2' && r.tsf_code === 'DE6') return false // R1 = DE2: delete DE6
      if (f.source === 'DE6' && r.tsf_code !== 'DE6') return false // R2 = DE6: delete everything else
    }
    return true
  })
}

// ------------------------------------------------------------------ posting stores

export function createStore(): Store {
  return { posted: {}, docs: {}, nextDoc: FIRST_DOC_NO }
}

function postedKey(bukrs: string, rfha: string, keyYmd: string): string {
  return bukrs + '|' + rfha + '|' + keyYmd
}

export function loadPostedRecord(store: Store, bukrs: string, rfha: string, keyYmd: string): PostedRecord | null {
  return store.posted[postedKey(bukrs, rfha, keyYmd)] ?? null
}

export function loadAccountingDocument(store: Store, docNo: string): AccountingDocument | null {
  return store.docs[docNo] ?? null
}

// ------------------------------------------------------------------ POSTING
// POST_DOCUMNET / HEADER_DATA / DEBIT / CREDIT / BAPI_POST / REVERSAL_POSTING

function glPadded(gl: string): string {
  return gl ? ('0000000000' + gl).slice(-10) : ''
}

const NO_ACCOUNTING: AccountingRow = {
  zbukrs: '',
  int_ext: 'E',
  type: 'MG',
  zndf: '',
  acc_cat: '',
  gl_debit: '',
  gl_credit: '',
  pc_debit: '',
  ba_debit: '',
  pc_credit: '',
  ba_credit: '',
  doc_debit: '',
  doc_credit: '',
  doc_header: '',
}

export function determineAccounting(r: Pick<Deal, 'v_gl' | 'sgsart' | 'sfhaart' | 'bukrs' | 'rportb'>): AccountingRow {
  const lvGl = r.v_gl < 0 ? 'ML' : 'MG'
  const lvNdf = r.sgsart.charAt(2) === 'D' ? 'X' : ''
  const ext = EXT_FX.find((e) => e.zsgsart === r.sgsart && e.zsfhaart === r.sfhaart)
  let acc: AccountingRow | undefined
  if (ext) {
    acc = ACCOUNTING_TABLE.find((a) => {
      if (a.zbukrs !== r.bukrs || a.type !== lvGl || a.zndf !== lvNdf) return false
      if (ext.ztsf === 'X') return a.int_ext === 'T'
      if (lvNdf === 'X') return a.int_ext === 'E'
      return a.int_ext === 'E' && a.acc_cat === r.rportb
    })
  }
  return acc ?? NO_ACCOUNTING
}

/** Amount basis: the local currency (THB) for TH10 / DE2 (V_GL_TH), otherwise USD (V_GL). */
export function postingBasis(r: Pick<Deal, 'tsf_code' | 'v_gl' | 'v_gl_th'>, ctx: PostingContext): { currency: string; amount: number; thb: boolean } {
  const th = !!(ctx.localCurrency && r.tsf_code === 'DE2')
  return { currency: th ? ctx.localCurrency : 'USD', amount: th ? r.v_gl_th : r.v_gl, thb: th }
}

export type PostingDocument = { header: DocHeader; items: AccountingDocument['items'] }

export function buildPostingDocument(r: Deal, acc: AccountingRow, ctx: PostingContext): PostingDocument {
  const basis = postingBasis(r, ctx)
  const abs = Math.abs(basis.amount)
  return {
    header: {
      comp_code: r.bukrs,
      doc_date: ctx.keyYmd,
      pstng_date: ctx.keyYmd,
      doc_type: r.tsf_code === 'DE2' ? 'TS' : 'TR',
      header_txt: acc.doc_header,
      ref_doc_no: r.rfha,
    },
    items: [
      {
        itemno: 1,
        gl_account: glPadded(acc.gl_debit),
        profit_ctr: acc.pc_debit || r.prctr,
        bus_area: acc.ba_debit || r.rbusa,
        item_text: acc.doc_debit + ':' + r.xtext,
        currency: basis.currency,
        amount: abs,
      },
      {
        itemno: 2,
        gl_account: glPadded(acc.gl_credit),
        profit_ctr: acc.pc_credit || r.prctr,
        bus_area: acc.ba_credit || r.rbusa,
        item_text: acc.doc_credit + ':' + r.xtext,
        currency: basis.currency,
        amount: -abs,
      },
    ],
  }
}

type BapiResult = { store: Store; ok: boolean; docNo: string; message: string }

/** Mock BAPI_ACC_DOCUMENT_POST: fails when a G/L account could not be determined. */
export function mockBapiPostDocument(store: Store, docDef: PostingDocument): BapiResult {
  if (docDef.items.some((i) => !i.gl_account)) {
    // Assumption carried over from the original: the missing-account error uses TEXT-113.
    return { store, ok: false, docNo: '', message: TEXTS.accNotMaintained }
  }
  const docNo = String(store.nextDoc)
  const doc: AccountingDocument = {
    docNo,
    bukrs: docDef.header.comp_code,
    year: docDef.header.pstng_date.slice(0, 4),
    header: docDef.header,
    items: docDef.items,
    reversalOf: '',
    reversalReason: '',
  }
  return {
    store: { ...store, nextDoc: store.nextDoc + 1, docs: { ...store.docs, [docNo]: doc } },
    ok: true,
    docNo,
    message: TEXTS.posted,
  }
}

/** Mock BAPI_ACC_DOCUMENT_REV_POST: posting date = key date + 1, reason 02. */
export function mockBapiReverseDocument(store: Store, origDocNo: string, keyYmd: string): BapiResult {
  const orig = store.docs[origDocNo]
  if (!orig) throw new Error(`Document ${origDocNo} not found`)
  const pDate = addDaysYmd(keyYmd, 1)
  const docNo = String(store.nextDoc)
  const doc: AccountingDocument = {
    docNo,
    bukrs: orig.bukrs,
    year: pDate.slice(0, 4),
    header: { ...orig.header, pstng_date: pDate },
    items: orig.items.map((i) => ({ ...i, amount: -i.amount })),
    reversalOf: origDocNo,
    reversalReason: '02',
  }
  return {
    store: { ...store, nextDoc: store.nextDoc + 1, docs: { ...store.docs, [docNo]: doc } },
    ok: true,
    docNo,
    message: TEXTS.posted,
  }
}

/** mtm_doc IS INITIAL AND v_gl IS NOT INITIAL. */
export function canPostRow(r: Pick<Deal, 'mtm_doc' | 'v_gl'>): boolean {
  return !r.mtm_doc && r.v_gl !== 0
}

/** Why the selected deal cannot be posted, or '' when it can. */
export function postBlockReason(row: Pick<Deal, 'mtm_doc' | 'v_gl'> | null): string {
  if (!row) return 'Select a deal to post.'
  if (row.mtm_doc) return 'This deal already has an MTM document.'
  if (row.v_gl === 0) return 'This deal has no valuation gain/loss to post.'
  return ''
}

export function postButtonTitle(row: Pick<Deal, 'mtm_doc' | 'v_gl' | 'rfha'> | null): string {
  return postBlockReason(row) || 'Post MTM document for deal ' + (row?.rfha ?? '')
}

/** Posts one deal: returns the updated row, the message-log rows and the new store. */
export function postDeal(r: Deal, ctx: PostingContext, store: Store): { row: Deal; msgs: MsgRow[]; store: Store } {
  const msgs: MsgRow[] = []
  const addMsg = (ok: boolean, doc: string, text: string) => {
    msgs.push({ ok, bukrs: r.bukrs, rfha: r.rfha, doc, diff: postingBasis(r, ctx).amount, message: text, cswap_rate: r.c_rate })
  }
  const acc = determineAccounting(r)
  const docDef = buildPostingDocument(r, acc, ctx)
  const res = mockBapiPostDocument(store, docDef)
  if (!res.ok) {
    // ROLLBACK: an error row, no document.
    addMsg(false, '', res.message)
    return { row: r, msgs, store }
  }
  addMsg(true, res.docNo, res.message)
  const rev = mockBapiReverseDocument(res.store, res.docNo, ctx.keyYmd) // REVERSAL_POSTING
  addMsg(true, rev.docNo, rev.message)
  const row: Deal = { ...r, mtm_doc: res.docNo, rev_doc: rev.docNo, msg: TEXTS.posted }
  const record: PostedRecord = { bukrs: r.bukrs, rfha: r.rfha, keyYmd: ctx.keyYmd, doc: row.mtm_doc, rev: row.rev_doc, msg: row.msg }
  return {
    row,
    msgs,
    store: { ...rev.store, posted: { ...rev.store.posted, [postedKey(record.bukrs, record.rfha, record.keyYmd)]: record } },
  }
}

/**
 * ALL_POSTING: posts every deal of `scope` that has no MTM document and a non-zero gain/loss.
 * `dataset` is the full valuated list, returned with the posted rows replaced.
 */
export function postAll(
  dataset: readonly Deal[],
  scope: readonly Deal[],
  ctx: PostingContext,
  store: Store,
): { dataset: Deal[]; msgs: MsgRow[]; store: Store } {
  let current = store
  let msgs: MsgRow[] = []
  const updated = new Map<string, Deal>()
  for (const r of scope) {
    if (!canPostRow(r)) continue
    const res = postDeal(r, ctx, current)
    current = res.store
    msgs = msgs.concat(res.msgs)
    updated.set(r.rfha, res.row)
  }
  return { dataset: dataset.map((r) => updated.get(r.rfha) ?? r), msgs, store: current }
}

/** Posts the deals already posted when the demo opens. */
export function seedPostedHistory(): Store {
  let store = createStore()
  for (const s of POSTED_HISTORY) {
    const ctx: PostingContext = { keyYmd: s.keyYmd, localCurrency: getCompany(s.bukrs)?.localCurrency ?? '' }
    for (const r of valuateDealsFor(s.bukrs, s.keyYmd, store)) {
      if (s.rfhas.includes(r.rfha) && canPostRow(r)) store = postDeal(r, ctx, store).store
    }
  }
  return store
}

// ------------------------------------------------------------------ run parameters / Execute

export function validateKeyDate(raw: string): string {
  const text = raw.trim()
  if (!text) return 'Key Date is required'
  if (!parseDMY(text)) return 'Enter a valid date (dd-mm-yyyy)'
  if (!isMonthEndYmd(dmyToYmd(text))) return TEXTS.keyDateMonthEnd
  return ''
}

export function validateParams(bukrs: string, keyDate: string): ParamErrors {
  return { bukrs: bukrs ? '' : 'Company Code is required', keyDate: validateKeyDate(keyDate) }
}

export function hasErrors(e: ParamErrors): boolean {
  return !!(e.bukrs || e.keyDate)
}

export type ScreenData = {
  executed: Executed
  dataset: Deal[]
  filters: Filters
  store: Store
  /** gt_msg of the last posting run. */
  msgLog: MsgRow[]
}

export function postingContextOf(executed: Executed): PostingContext {
  return { keyYmd: executed.keyYmd, localCurrency: executed.localCurrency }
}

/**
 * START-OF-SELECTION: GET_DATA, then ALL_POSTING for "View With FI Posting", then the display.
 * The caller has validated the parameters. A change of company puts the DE2/DE6 radio button
 * back on DE6, its default.
 */
export function executeScreen(
  params: Pick<Params, 'bukrs' | 'keyDate' | 'posting'>,
  prev: Executed | null,
  filters: Filters,
  store: Store,
): ScreenData {
  const comp = getCompany(params.bukrs)
  if (!comp) throw new Error(`Unknown company code ${params.bukrs}`)
  const keyYmd = dmyToYmd(params.keyDate)
  const companyChanged = !prev || prev.bukrs !== params.bukrs
  const executed: Executed = { bukrs: params.bukrs, keyYmd, localCurrency: comp.localCurrency, th10: !!comp.localCurrency }
  const nextFilters: Filters = companyChanged ? { ...filters, source: 'DE6' } : filters
  let dataset = valuateDealsFor(params.bukrs, keyYmd, store)
  let msgLog: MsgRow[] = []
  let nextStore = store
  if (params.posting === 'post') {
    const res = postAll(dataset, applySelectionCriteria(dataset, nextFilters, params.bukrs), postingContextOf(executed), store)
    dataset = res.dataset
    msgLog = res.msgs
    nextStore = res.store
  }
  return { executed, dataset, filters: nextFilters, store: nextStore, msgLog }
}

/** The screen as it stands after Refresh, and when it first opens: history re-seeded, the defaults executed. */
export function freshScreen(): ScreenData {
  return executeScreen(
    { bukrs: DEFAULTS.bukrs, keyDate: DEFAULTS.keyDate, posting: DEFAULTS.posting },
    null,
    DEFAULT_FILTERS,
    seedPostedHistory(),
  )
}

// ------------------------------------------------------------------ the list

/** layout: '/FULL' shows every column, '/VALUATION' the valuation view, anything else the default. */
export function layoutCode(layout: string): 'f' | 'v' | 'd' {
  if (layout === '/FULL') return 'f'
  if (layout === '/VALUATION') return 'v'
  return 'd'
}

/** V_GL_TH is technical (hidden) unless the TH10 parameter exists and DE2 is selected (R1). */
export function thbColumnActive(executed: Executed | null, filters: Filters): boolean {
  return !!(executed && executed.th10 && filters.source === 'DE2')
}

export function getVisibleColumns(layout: string, thbActive: boolean): Column[] {
  const code = layoutCode(layout)
  return COLUMNS.filter((c) => {
    if (c.thOnly && !thbActive) return false
    return c.layouts.includes(code)
  })
}

const NUMERIC_TYPES: ReadonlySet<Column['type']> = new Set(['amt', 'rate', 'swap', 'gl', 'num'])

export function isNumericColumn(c: Column): boolean {
  return NUMERIC_TYPES.has(c.type)
}

/** The classes a body cell gets for its column. */
export function colClasses(col: Column): string {
  const c: string[] = []
  if (isNumericColumn(col)) c.push('num', 'mono')
  if (col.type === 'date') c.push('mono')
  if (col.group) c.push('t-' + col.group)
  return c.join(' ')
}

export function statusClass(desc: string): string {
  const code = String(desc || '').slice(0, 2)
  if (code === '03') return 'status-text-ok'
  if (code === '04') return 'status-text-info'
  return 'status-text-warn'
}

/** What a cell shows; also what Search and the CSV export see. */
export function cellText(r: Deal, col: Column): string {
  const v = r[col.key]
  switch (col.type) {
    case 'date':
      return v ? ymdToDmy(String(v)) : ''
    case 'amt':
      return v === undefined || v === '' ? '' : formatAmount(v)
    case 'gl':
      return formatAmount(v)
    case 'rate':
      return col.blankZero && !v ? '' : formatRate(v, rateDp(r))
    case 'swap':
      return formatRate(v, swapDp(r))
    default:
      return v == null ? '' : String(v)
  }
}

function sortValue(r: Deal, col: Column): number | string {
  const v = r[col.sortKey ?? col.key]
  if (isNumericColumn(col)) return Number(v) || 0
  return String(v ?? '').toLowerCase()
}

/** Search across the visible columns, then the sort (ties broken by deal number). */
export function filterSortRows(scope: readonly Deal[], cols: readonly Column[], search: string, sort: Sort): Deal[] {
  const q = search.trim().toLowerCase()
  let list = scope.slice()
  if (q) list = list.filter((r) => cols.some((c) => cellText(r, c).toLowerCase().includes(q)))
  const sortCol = COLUMNS.find((c) => c.key === sort.field)
  if (sortCol) {
    const dir = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const x = sortValue(a, sortCol)
      const y = sortValue(b, sortCol)
      if (x < y) return -1 * dir
      if (x > y) return 1 * dir
      return a.rfha < b.rfha ? -1 : a.rfha > b.rfha ? 1 : 0
    })
  }
  return list
}

/** Clicking a header sorts ascending; clicking the sorted header again flips the direction. */
export function nextSort(sort: Sort, field: Sort['field']): Sort {
  if (sort.field === field) return { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field, dir: 'asc' }
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(page, totalPages(total, pageSize))
}

export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export function recordCountText(total: number): string {
  return total + (total === 1 ? ' deal' : ' deals')
}

export function showingText(page: number, pageSize: number, total: number): string {
  const start = (page - 1) * pageSize
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(start + pageSize, total)
  return `Showing ${from}–${to} of ${total}`
}

export function emptyText(datasetSize: number): string {
  return datasetSize === 0 ? 'No deals are active for this company code and key date.' : 'No deals match your search or filters.'
}

/** The Deal No / Counterparty range boxes accept digits only. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

// ------------------------------------------------------------------ export, log and document helpers

/** The standard ALV spreadsheet function, mocked as a CSV of the visible columns. */
export function buildCsv(cols: readonly Column[], rows: readonly Deal[]): string {
  const q = (v: string) => '"' + v.replace(/"/g, '""') + '"'
  const lines = [cols.map((c) => q(c.label)).join(',')]
  for (const r of rows) lines.push(cols.map((c) => q(cellText(r, c))).join(','))
  return lines.join('\r\n')
}

export function csvFileName(executed: Pick<Executed, 'bukrs' | 'keyYmd'>): string {
  return 'FX_MTM_' + executed.bukrs + '_' + ymdToDmy(executed.keyYmd) + '.csv'
}

export function exportToastText(count: number, fileName: string): string {
  return 'Exported ' + count + (count === 1 ? ' deal' : ' deals') + ' to ' + fileName
}

export function logSubtitle(executed: Pick<Executed, 'bukrs' | 'keyYmd'>, count: number): string {
  return `${executed.bukrs} · Key Date ${ymdToDmy(executed.keyYmd)} · ${count}${count === 1 ? ' message' : ' messages'}`
}

export function documentTotals(items: readonly { amount: number }[]): { debit: number; credit: number } {
  let debit = 0
  let credit = 0
  for (const i of items) {
    if (i.amount > 0) debit += i.amount
    if (i.amount < 0) credit += -i.amount
  }
  return { debit, credit }
}

/** Company search text for the dropdown: code, name and TSF entity. */
export function companySearchText(c: Company): string {
  return (c.code + ' ' + c.name + ' ' + c.entity).toLowerCase()
}
