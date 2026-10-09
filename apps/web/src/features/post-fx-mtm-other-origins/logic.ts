// The business logic of ZSGTSFR023, ported from the legacy script: selection, valuation, swap
// interpolation, posting with its reversal, and the table/paging rules. Pure functions only.
import {
  CCY_DECIMALS,
  COLUMNS,
  CURRENT_USER,
  DEAL_SEEDS,
  DOC_SEQ_START,
  EXCLUDED_TXN_STATUS,
  GL_BASES,
  KEY_DATE_INVALID,
  KEY_DATE_NOT_MONTH_END,
  KEY_DATE_REQUIRED,
  LAYOUT_COLUMN_SETS,
  MOCK_COMPANIES,
  MOCK_CURRENCY_PAIRS,
  MOCK_PARTNERS,
  MOCK_PROFIT_CENTRES,
  MTM_WINDOW_DAYS,
  POSTED_MESSAGE,
  SPOT_MODEL,
  SWAP_ANNUAL_POINTS,
  SWAP_TENOR_DAYS,
} from './data.ts'
import {
  MONTH_SHORT,
  addDaysISO,
  diffDays,
  dmyToISO,
  formatNumber,
  isMonthEndISO,
  isoToDMY,
  lastDayOfMonthISO,
  padLeft,
  pad2,
  round2,
  round4,
  round6,
} from './format.ts'
import type {
  AccConfig,
  CalendarView,
  Column,
  ColumnKey,
  CurrencyPair,
  Criteria,
  Db,
  Deal,
  DealType,
  DetailSection,
  DocKind,
  DocumentView,
  LogMessage,
  MtmMonth,
  MtmRecord,
  RfhaRange,
  Row,
  Sort,
  SwapPoint,
} from './types.ts'

// ------------------------------------------------------------------ mock database

function pairInfo(pair: string): CurrencyPair | null {
  return MOCK_CURRENCY_PAIRS.find((cp) => cp.pair === pair) ?? null
}

/** Month-end spot per pair, 2025-2028: base x (1 + drift + wave), anchored on 30-09-2026. */
export function buildSpotTable(): Record<string, Record<string, number>> {
  const spot: Record<string, Record<string, number>> = {}
  for (const cp of MOCK_CURRENCY_PAIRS) {
    const mdl = SPOT_MODEL[cp.pair]
    if (!mdl) continue
    const tbl: Record<string, number> = {}
    for (let y = 2025; y <= 2028; y++) {
      for (let m = 1; m <= 12; m++) {
        const offset = (y - 2026) * 12 + (m - 9)
        tbl[`${y}-${pad2(m)}`] =
          mdl.base * (1 + mdl.drift * offset + mdl.amp * Math.sin(offset * 1.3 + mdl.phase) - mdl.amp * Math.sin(mdl.phase))
      }
    }
    spot[cp.pair] = tbl
  }
  return spot
}

/** One loss and one gain row per company, for deliverable and for NDF deals. */
export function buildAccountingConfig(): AccConfig[] {
  const out: AccConfig[] = []
  for (const co of MOCK_COMPANIES) {
    const g = GL_BASES[co.bukrs]
    if (!g) continue
    ;(['', 'X'] as const).forEach((ndf, i) => {
      out.push({
        zbukrs: co.bukrs,
        type: 'ML',
        zndf: ndf,
        glDebit: String(g.loss + i),
        glCredit: String(g.prov + i),
        pcDebit: '',
        baDebit: '',
        pcCredit: '',
        baCredit: '',
        docDebit: 'MTM Loss',
        docCredit: 'MTM Provision',
        docHeader: ndf ? 'FX MTM Loss NDF' : 'FX MTM Loss',
      })
      out.push({
        zbukrs: co.bukrs,
        type: 'MG',
        zndf: ndf,
        glDebit: String(g.asset + i),
        glCredit: String(g.gain + i),
        pcDebit: '',
        baDebit: '',
        pcCredit: '',
        baCredit: '',
        docDebit: 'MTM Receivable',
        docCredit: 'MTM Gain',
        docHeader: ndf ? 'FX MTM Gain NDF' : 'FX MTM Gain',
      })
    })
  }
  return out
}

/** Month-end spot for a key date's month; 0 when the table has no rate. */
export function spotAt(db: Pick<Db, 'spot'>, pair: string, keyIso: string): number {
  const v = db.spot[pair]?.[keyIso.slice(0, 7)]
  return v ? round4(v) : 0
}

/** Swap points curve for a pair on a key date (ascending by tenor). */
export function swapCurveFor(pair: string, keyIso: string): SwapPoint[] {
  const offset = (Number(keyIso.slice(0, 4)) - 2026) * 12 + (Number(keyIso.slice(5, 7)) - 9)
  const scale = 1 + 0.05 * Math.sin(offset * 0.9)
  const annual = SWAP_ANNUAL_POINTS[pair] ?? 0
  return SWAP_TENOR_DAYS.map((days) => ({ dlfz: days, kkurs: round6(annual * Math.pow(days / 365, 1.04) * scale) }))
}

function decimalsForPair(pair: string): number {
  if (pair === 'USD-VND') return 2
  if (pair === 'USD-JPY') return 3
  return 4
}

/** Builds the demo deals and the MTM documents already posted for some of them. */
export function buildDeals(spot: Db['spot']): { deals: Deal[]; mtmData: MtmRecord[]; docSeq: number } {
  const deals: Deal[] = []
  const mtmData: MtmRecord[] = []
  let docSeq = DOC_SEQ_START
  DEAL_SEEDS.forEach((sd, idx) => {
    const [co, pair, productType, fAmt, dir, start, maturity, partnerIdx, devBp, postedFor, extra] = sd
    const pi = pairInfo(pair)
    const partner = MOCK_PARTNERS[partnerIdx]
    const pc = MOCK_PROFIT_CENTRES[co]
    const company = MOCK_COMPANIES.find((c) => c.bukrs === co)
    if (!pi || !partner || !pc || !company) throw new Error(`bad deal seed ${idx + 1}`)
    const ex = extra ?? {}
    const curr1 = pi.f
    const curr2 = pi.t
    const zwaers = 'USD'
    const foreignIsLeg1 = curr1 !== zwaers
    // Contract rate = market forward at trade date for the tenor, plus a small deviation.
    const tradeSpot = spotAt(
      { spot },
      pair,
      lastDayOfMonthISO(Number(start.slice(0, 4)), Number(start.slice(5, 7))),
    )
    const tenorDays = diffDays(maturity, start)
    const points = ((SWAP_ANNUAL_POINTS[pair] ?? 0) * tenorDays) / 365
    const cRate = +((tradeSpot + points) * (1 + devBp / 10000)).toFixed(decimalsForPair(pair))
    const usdAmt = pi.t === 'USD' ? round2(fAmt * cRate) : round2(fAmt / cRate)
    const oppDir = dir === 'S' ? 'Buy' : 'Sell'
    const fDir = dir === 'S' ? 'Sell' : 'Buy'
    const numRfha = 1200003100 + idx * 3
    deals.push({
      bukrs: co,
      butxt: company.name,
      rfha: String(numRfha),
      ztsfDealId: `D26${co.slice(0, 2)}${padLeft(idx + 1, 3, '0')}`,
      zolamDealNo: `OLM26${padLeft(410 + idx, 5, '0')}`,
      xtext: `${pair}${productType.charAt(2) === 'D' ? ' NDF ' : ' Fwd '}${MONTH_SHORT[Number(maturity.slice(5, 7)) - 1]}-${maturity.slice(2, 4)}`,
      kontrh: partner.id,
      bpName: partner.name,
      cpair: pair,
      sgsart: productType,
      curr1,
      curr2,
      fromCurr: pi.f,
      toCurr: pi.t,
      amt1: foreignIsLeg1 ? (dir === 'S' ? -fAmt : fAmt) : dir === 'S' ? usdAmt : -usdAmt,
      amt2: foreignIsLeg1 ? (dir === 'S' ? usdAmt : -usdAmt) : dir === 'S' ? -fAmt : fAmt,
      bs1: foreignIsLeg1 ? fDir : oppDir,
      bs2: foreignIsLeg1 ? oppDir : fDir,
      bsO: dir === 'S' ? '1' : '2',
      cRate,
      zwaers,
      dblfz: start,
      delfz: maturity,
      prctr: pc.prctr,
      pcName: pc.pcName,
      rbusa: pc.rbusa,
      baName: pc.baName,
      txnStatus: ex.txnStatus || '20',
      saktiv: ex.saktiv || '1',
      bapiError: ex.bapiError || '',
    })
    for (const dt of postedFor) {
      const doc = String(docSeq++)
      const rev = String(docSeq++)
      mtmData.push({
        ztype: '01',
        zbukrs: co,
        zrfha: String(numRfha),
        zdate: dt,
        zdoc: doc,
        zrevDoc: rev,
        zmsg: POSTED_MESSAGE,
        zcreatedBy: CURRENT_USER,
      })
    }
  })
  return { deals, mtmData, docSeq }
}

export function createMockDb(): Db {
  const spot = buildSpotTable()
  const { deals, mtmData, docSeq } = buildDeals(spot)
  return { deals, mtmData, accConfig: buildAccountingConfig(), spot, docSeq }
}

export function findMtmData(db: Db, bukrs: string, rfha: string, keyIso: string): MtmRecord | null {
  return db.mtmData.find((m) => m.zbukrs === bukrs && m.zrfha === rfha && m.zdate === keyIso && m.ztype === '01') ?? null
}

// ---------------------------------------------------------------- key date and filters

/** The message under the Key Date box ('' when it is a real month end), plus the ISO date when valid. */
export function validateKeyDate(text: string): { raw: string; error: string; iso: string | null } {
  const raw = String(text || '').trim()
  if (!raw) return { raw, error: KEY_DATE_REQUIRED, iso: null }
  const iso = dmyToISO(raw)
  if (!iso) return { raw, error: KEY_DATE_INVALID, iso: null }
  if (!isMonthEndISO(iso)) return { raw, error: KEY_DATE_NOT_MONTH_END, iso: null }
  return { raw, error: '', iso }
}

/** "5-9" is a range, "1,2 3;4" are single numbers; the transaction box accepts all of them. */
export function parseRfhaFilter(text: string): RfhaRange[] {
  const out: RfhaRange[] = []
  for (const tok of String(text || '').split(/[,\s;]+/)) {
    if (!tok) continue
    const m = /^(\w+)\s*-\s*(\w+)$/.exec(tok)
    if (m) out.push({ from: m[1] ?? '', to: m[2] ?? '' })
    else out.push({ from: tok, to: tok })
  }
  return out
}

export function matchesRfha(rfha: string, ranges: readonly RfhaRange[]): boolean {
  if (!ranges.length) return true
  return ranges.some((r) => rfha >= r.from && rfha <= r.to)
}

/** Selection is only read once the Key Date is valid and at least one company is chosen. */
export function selectionReady(keyError: string, companies: readonly string[]): boolean {
  return !keyError && companies.length > 0
}

// ------------------------------------------------------------------- valuation

/** GET_MONTH: the next 60 month ends after the key date, each with a +/- window (TVARV days). */
export function buildMtmMonths(keyIso: string): MtmMonth[] {
  const y = Number(keyIso.slice(0, 4))
  const m = Number(keyIso.slice(5, 7))
  const out: MtmMonth[] = []
  for (let i = 1; i <= 60; i++) {
    const mm = m + i
    const yy = y + Math.floor((mm - 1) / 12)
    const mo = ((mm - 1) % 12) + 1
    const end = lastDayOfMonthISO(yy, mo)
    out.push({
      zmonth: i,
      zmonthDate: end,
      lowDate: addDaysISO(end, -MTM_WINDOW_DAYS),
      highDate: addDaysISO(end, MTM_WINDOW_DAYS),
    })
  }
  return out
}

/** SWAP_CALC: tenor bracketing plus month-bucket interpolation (same rules as the ABAP). */
export function calculateSwap(
  pair: string,
  keyIso: string,
  valueIso: string,
  months: readonly MtmMonth[],
): { swap: number; month: number } {
  const vm = months.find((mo) => mo.zmonthDate.slice(0, 7) === valueIso.slice(0, 7))
  if (!vm) return { swap: 0, month: 0 }
  const month = vm.zmonth
  const noDays = diffDays(vm.zmonthDate, keyIso)
  let low: SwapPoint | null = null
  let high: SwapPoint | null = null
  for (const t of swapCurveFor(pair, keyIso)) {
    if (t.dlfz <= noDays) low = t
    else if (!high) high = t
  }
  const lo = low ?? { dlfz: 0, kkurs: 0 }
  const hi = high ?? { dlfz: 0, kkurs: 0 }
  const bucketFor = (dateIso: string): number => {
    const hit = months.find((mo) => mo.lowDate < dateIso && dateIso < mo.highDate)
    return hit ? hit.zmonth : 0
  }
  const b = bucketFor(addDaysISO(keyIso, lo.dlfz))
  const b1 = bucketFor(addDaysISO(keyIso, hi.dlfz))
  let swap = 0
  if (month === b) swap = lo.kkurs
  else if (month === b1) swap = hi.kkurs
  else if (month > b && month <= b1) {
    const perMonth = (hi.kkurs - lo.kkurs) / (b1 - b)
    swap = lo.kkurs + perMonth * (month - b)
  } else if (month > b1) swap = lo.kkurs
  return { swap: round6(swap), month }
}

/** CALC_FOREX_CURRENCY_AMOUNT: a foreign amount in USD at a rate (direction from the pair). */
export function convertToUsd(fAmt: number, rate: number, toCurr: string): number {
  if (!rate) return 0
  return round2(toCurr === 'USD' ? fAmt * rate : fAmt / rate)
}

/**
 * Valuation gain/loss in USD. The size is |valuation amount - contract amount|; a Buy loses when
 * the contract rate is at or above the valuation rate, a Sell loses when it is below.
 */
export function gainLoss(buySell: string, cRate: number, vRate: number, vAmt: number, ccAmt: number): number {
  let gl = 0
  if (vAmt !== 0) gl = round2(vAmt - ccAmt)
  gl = Math.abs(gl)
  if (buySell === 'Buy') {
    if (cRate >= vRate && gl !== 0) gl = -gl
  } else if (!(cRate >= vRate) && gl !== 0) gl = -gl
  return gl
}

/** Per-transaction derivation inside the GET_DATA loop. */
export function valuateTransaction(db: Db, deal: Deal, keyIso: string, months: readonly MtmMonth[]): Row {
  const local = deal.curr1 === deal.zwaers
  const fAmt = Math.abs(local ? deal.amt2 : deal.amt1)
  const fCurr = local ? deal.curr2 : deal.curr1
  const ccAmt = convertToUsd(fAmt, deal.cRate, deal.toCurr)
  const vSpot = spotAt(db, deal.cpair, keyIso)
  const sw = calculateSwap(deal.cpair, keyIso, deal.delfz, months)
  const vRate = round4(vSpot + sw.swap)
  const vAmt = convertToUsd(fAmt, vRate, deal.toCurr)
  const lvBs = deal.curr1 === fCurr ? deal.bs1 : deal.bs2
  const mtm = findMtmData(db, deal.bukrs, deal.rfha, keyIso)
  return {
    ...deal,
    key: `${deal.bukrs}|${deal.rfha}`,
    fAmt,
    fCurr,
    bsBu: deal.bsO === '1' ? 'Sell' : 'Buy',
    ccAmt,
    vSpot,
    vSwap: sw.swap,
    monat: sw.month,
    vRate,
    vAmt,
    vGl: gainLoss(lvBs, deal.cRate, vRate, vAmt, ccAmt),
    month: `${MONTH_SHORT[Number(deal.delfz.slice(5, 7)) - 1]} ${deal.delfz.slice(0, 4)}`,
    mtmDoc: mtm ? mtm.zdoc : '',
    revDoc: mtm ? mtm.zrevDoc : '',
    msg: mtm ? mtm.zmsg : '',
  }
}

/** GET_DATA: select, derive and value the transactions for the selection criteria. */
export function getFxTransactions(db: Db, c: Criteria): Row[] {
  const months = buildMtmMonths(c.keyIso)
  const out: Row[] = []
  for (const deal of db.deals) {
    if (!c.companies.includes(deal.bukrs)) continue
    if (!(deal.dblfz <= c.keyIso && deal.delfz > c.keyIso)) continue // DBLFZ <= date < DELFZ
    if (!matchesRfha(deal.rfha, c.rfhaRanges)) continue
    if (c.bp && deal.kontrh !== c.bp) continue
    if (deal.saktiv === '3') continue // SAKTIV <> '3'
    if (EXCLUDED_TXN_STATUS.includes(deal.txnStatus)) continue // TXN_STATUS NOT IN TVARV
    const isNdf = deal.sgsart.charAt(2) === 'D'
    if (c.dealType === 'NDF' && !isNdf) continue // RR1
    if (c.dealType === 'DELIVERABLE' && isNdf) continue // RR2
    if (c.pair && deal.cpair !== c.pair) continue // P_CURR
    out.push(valuateTransaction(db, deal, c.keyIso, months))
  }
  return out
}

// ---------------------------------------------------------------------- posting

export function getAccountingConfig(db: Db, row: Row): AccConfig | null {
  const type = row.vGl < 0 ? 'ML' : 'MG'
  const ndf = row.sgsart.charAt(2) === 'D' ? 'X' : ''
  return db.accConfig.find((c) => c.type === type && c.zndf === ndf && c.zbukrs === row.bukrs) ?? null
}

/** POST is processed only when MTM_DOC is initial and V_GL is not initial. */
export function isPostable(row: Row | null | undefined): row is Row {
  return !!row && !row.mtmDoc && row.vGl !== 0
}

export function postButtonTitle(row: Row | null | undefined): string {
  if (isPostable(row)) return ''
  return row
    ? 'Only transactions without an MTM document and with a valuation gain/loss can be posted'
    : 'Select a transaction first'
}

/**
 * POST_DOCUMNET -> BAPI_ACC_DOCUMENT_POST (+ reversal), mocked. Returns the message rows (GT_MSG)
 * and the database with the new document pair. A missing posting configuration is swallowed, as in
 * the source (CX_SY_ITAB_LINE_NOT_FOUND); a BAPI error posts nothing.
 */
export function postMtmDocument(db: Db, row: Row, keyIso: string): { db: Db; msgs: LogMessage[] } {
  const cfg = getAccountingConfig(db, row)
  if (!cfg) return { db, msgs: [] }
  const deal = [...db.deals].reverse().find((d) => d.rfha === row.rfha && d.bukrs === row.bukrs)
  if (deal && deal.bapiError) {
    return { db, msgs: [{ ok: false, rfha: row.rfha, doc: '', diff: row.vGl, message: deal.bapiError, cRate: row.cRate }] }
  }
  const doc = String(db.docSeq)
  const rev = String(db.docSeq + 1) // BAPI_ACC_DOCUMENT_REV_POST, posting date = key date + 1
  const entry = (n: string): LogMessage => ({
    ok: true,
    rfha: row.rfha,
    doc: n,
    diff: row.vGl,
    message: POSTED_MESSAGE,
    cRate: row.cRate,
  })
  const record: MtmRecord = {
    ztype: '01',
    zbukrs: row.bukrs,
    zrfha: row.rfha,
    zdate: keyIso,
    zdoc: doc,
    zrevDoc: rev,
    zmsg: POSTED_MESSAGE,
    zcreatedBy: CURRENT_USER,
  }
  return {
    db: { ...db, docSeq: db.docSeq + 2, mtmData: [...db.mtmData, record] },
    msgs: [entry(doc), entry(rev)],
  }
}

/** Execute Posting: every unposted row of the selection, one after the other. */
export function postAll(db: Db, rows: readonly Row[], keyIso: string): { db: Db; msgs: LogMessage[] } {
  let cur = db
  const msgs: LogMessage[] = []
  for (const r of rows) {
    if (!isPostable(r)) continue
    const res = postMtmDocument(cur, r, keyIso)
    cur = res.db
    msgs.push(...res.msgs)
  }
  return { db: cur, msgs }
}

export function countPostable(rows: readonly Row[]): number {
  return rows.filter((r) => isPostable(r)).length
}

export type ExecuteState = { visible: boolean; disabled: boolean; label: string; title: string }

/** The Execute Posting button: only shown for "View With FI Posting", and counts what it would post. */
export function executeState(rows: readonly Row[], postingType: 'POST' | 'VIEW'): ExecuteState {
  const postMode = postingType === 'POST'
  const n = countPostable(rows)
  return {
    visible: postMode,
    disabled: !(postMode && n > 0),
    label: `Execute Posting${postMode ? ` (${n})` : ''}`,
    title: n > 0 ? 'Posts all unposted transactions in the current selection' : 'No unposted transactions in the selection',
  }
}

export const NOT_POSTABLE_TOAST = 'This transaction is already posted or has no valuation gain/loss.'

// -------------------------------------------------------------------- documents

/** FB03 stand-in: rebuilds the two-line posting from the BAPI input logic (header / debit / credit). */
export function buildDocumentView(db: Db, row: Row, which: DocKind, keyIso: string): DocumentView {
  const cfg = getAccountingConfig(db, row)
  const isRev = which === 'rev'
  const postIso = isRev ? addDaysISO(keyIso, 1) : keyIso
  const abs = Math.abs(row.vGl)
  const gl = (n: string) => padLeft(n, 10, '0')
  const items: DocumentView['items'] = []
  if (cfg) {
    items.push({
      item: 1,
      gl: gl(cfg.glDebit),
      pc: cfg.pcDebit || row.prctr,
      ba: cfg.baDebit || row.rbusa,
      text: `${cfg.docDebit}:${row.xtext}`,
      amount: isRev ? -abs : abs,
    })
    items.push({
      item: 2,
      gl: gl(cfg.glCredit),
      pc: cfg.pcCredit || row.prctr,
      ba: cfg.baCredit || row.rbusa,
      text: `${cfg.docCredit}:${row.xtext}`,
      amount: isRev ? abs : -abs,
    })
  }
  return {
    docNo: isRev ? row.revDoc : row.mtmDoc,
    bukrs: row.bukrs,
    fiscalYear: postIso.slice(0, 4),
    docType: 'TR',
    docDate: postIso,
    postingDate: postIso,
    reference: row.rfha,
    headerText: cfg ? cfg.docHeader : '',
    user: CURRENT_USER,
    currency: row.zwaers,
    reversalOf: isRev ? row.mtmDoc : '',
    items,
  }
}

export function documentTitle(which: DocKind, docNo: string): string {
  return `${which === 'rev' ? 'Reversal Document' : 'Accounting Document'} ${docNo}`
}

export function ccyDec(ccy: string): number {
  return Object.hasOwn(CCY_DECIMALS, ccy) ? (CCY_DECIMALS[ccy] ?? 2) : 2
}

export function documentHeaderItems(v: DocumentView, row: Row): DetailSection['items'] {
  const items: DetailSection['items'] = [
    { label: 'Document Number', value: v.docNo },
    { label: 'Company Code', value: `${v.bukrs} – ${row.butxt}` },
    { label: 'Fiscal Year', value: v.fiscalYear },
    { label: 'Document Type', value: v.docType },
    { label: 'Document Date', value: isoToDMY(v.docDate) },
    { label: 'Posting Date', value: isoToDMY(v.postingDate) },
    { label: 'Reference', value: v.reference },
    { label: 'Currency', value: v.currency },
    { label: 'User Name', value: v.user },
    { label: 'Header Text', value: v.headerText, full: true },
  ]
  if (v.reversalOf) items.push({ label: 'Reversal Of Document', value: v.reversalOf, full: true })
  return items
}

export function transactionSections(row: Row, keyIso: string): DetailSection[] {
  return [
    {
      title: 'Transaction',
      items: [
        { label: 'Transaction', value: row.rfha },
        { label: 'Deal ID', value: row.ztsfDealId },
        { label: 'Olam Deal No', value: row.zolamDealNo },
        { label: 'Company Code', value: `${row.bukrs} – ${row.butxt}` },
        { label: 'Product Type', value: row.sgsart },
        { label: 'Txn Status', value: row.txnStatus },
        { label: 'Transaction Text', value: row.xtext, full: true },
        { label: 'Business Partner', value: `${row.kontrh} – ${row.bpName}`, full: true },
      ],
    },
    {
      title: 'Deal Terms',
      items: [
        { label: 'Currency Pair', value: row.cpair },
        { label: 'Buy/Sell', value: row.bsBu },
        { label: 'Contract Rate', value: formatNumber(row.cRate, 4) },
        { label: 'Start Date', value: isoToDMY(row.dblfz) },
        { label: 'Maturity Date', value: isoToDMY(row.delfz) },
        { label: 'Exp Mth-yr', value: row.month },
        { label: 'Foreign Amount', value: `${formatNumber(row.fAmt, ccyDec(row.fCurr))} ${row.fCurr}` },
        { label: 'Amount (USD)', value: `${formatNumber(row.ccAmt, 2)} ${row.zwaers}` },
        { label: 'Profit Center', value: `${row.prctr} – ${row.pcName}` },
        { label: 'Business Area', value: `${row.rbusa} – ${row.baName}`, full: true },
      ],
    },
    {
      title: `MTM Valuation (Key Date ${isoToDMY(keyIso)})`,
      items: [
        { label: 'Valuation Spot', value: formatNumber(row.vSpot, 4) },
        { label: 'Valuation Swap', value: formatNumber(row.vSwap, 6) },
        { label: 'Valuation Rate', value: formatNumber(row.vRate, 4) },
        { label: 'Valuation Amount (USD)', value: formatNumber(row.vAmt, 2) },
        { label: 'Valuation Gain/Loss (USD)', value: formatNumber(row.vGl, 2) },
        { label: 'Exp Mth', value: String(row.monat) },
      ],
    },
  ]
}

// ------------------------------------------------------------------------ table

/** The columns a layout variant shows; an unknown or default layout shows all of them. */
export function visibleColumns(layout: string): readonly Column[] {
  const set = LAYOUT_COLUMN_SETS[layout]
  if (!set) return COLUMNS
  return COLUMNS.filter((c) => set.includes(c.key))
}

/** The text a cell shows. */
export function cellText(col: Column, r: Row): string {
  if (col.fmt === 'date') return isoToDMY(String(r[col.key]))
  if (col.fmt === 'foreign') return formatNumber(r.fAmt, ccyDec(r.fCurr))
  if (col.fmt === 'rate4') return formatNumber(Number(r[col.key]), 4)
  if (col.fmt === 'swap6') return formatNumber(Number(r[col.key]), 6)
  if (col.fmt === 'amount2') return formatNumber(Number(r[col.key]), 2)
  const v = r[col.key]
  return v === null || v === undefined ? '' : String(v)
}

function sortValue(col: Column, r: Row): string | number {
  return col.sortByMaturityMonth ? r.delfz.slice(0, 7) : r[col.key]
}

/** Search across the visible columns' text, then sort by the chosen visible column. */
export function getViewRows(rows: readonly Row[], cols: readonly Column[], search: string, sort: Sort): Row[] {
  const q = search.trim().toLowerCase()
  let list = rows.filter((r) => !q || cols.some((c) => cellText(c, r).toLowerCase().includes(q)))
  const col = sort.field ? cols.find((c) => c.key === sort.field) : undefined
  if (col) {
    const dir = sort.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      const xa = sortValue(col, a)
      const ya = sortValue(col, b)
      if (col.type === 'num') return ((Number(xa) || 0) - (Number(ya) || 0)) * dir
      const x = String(xa).toLowerCase()
      const y = String(ya).toLowerCase()
      return x < y ? -dir : x > y ? dir : 0
    })
  }
  return list
}

/** Clicking the sorted column flips it; a new column starts ascending. */
export function nextSort(sort: Sort, key: ColumnKey): Sort {
  return sort.field === key ? { field: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field: key, dir: 'asc' }
}

/** A sort on a column the layout no longer shows is dropped. */
export function sortForColumns(sort: Sort, cols: readonly Column[]): Sort {
  return cols.some((c) => c.key === sort.field) ? sort : { field: '', dir: sort.dir }
}

export const DEFAULT_SORT: Sort = { field: '', dir: 'asc' }

export function sortIndicator(sort: Sort, key: ColumnKey): string {
  if (sort.field !== key) return '⇅'
  return sort.dir === 'asc' ? '▲' : '▼'
}

export function emptyMessage(keyError: string, companyCount: number): string {
  if (keyError) return 'Enter a valid month-end Key Date to load transactions.'
  if (companyCount === 0) return 'Select at least one company code to load transactions.'
  return 'No transactions match your search or filters.'
}

export function resultCountText(n: number): string {
  return `${n}${n === 1 ? ' transaction' : ' transactions'}`
}

export function dragLabel(row: Row | null): string {
  return row ? `${row.rfha} — ${row.cpair}` : 'Transaction'
}

// ----------------------------------------------------------------------- paging

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(total, size))
}

/** Page numbers with '…' gaps: all of them up to seven pages, else first, last and the current's neighbours. */
export function pagerItems(current: number, count: number): (number | '…')[] {
  const out: (number | '…')[] = []
  for (let p = 1; p <= count; p++) {
    if (count <= 7 || p === 1 || p === count || Math.abs(p - current) <= 1) out.push(p)
    else if (out[out.length - 1] !== '…') out.push('…')
  }
  return out
}

export function showingText(current: number, size: number, total: number, shown: number): string {
  if (!total) return ''
  const start = (current - 1) * size
  return `Showing ${start + 1}–${start + shown} of ${total}`
}

// --------------------------------------------------------------------- calendar

export function shiftMonth(v: CalendarView, delta: number): CalendarView {
  let { y, m } = v
  m += delta
  if (m < 0) {
    m = 11
    y--
  } else if (m > 11) {
    m = 0
    y++
  }
  return { y, m }
}

export type CalendarCell = { day: number; iso: string; kind: 'muted' | 'day'; eom: boolean }

/** Sunday-first month grid: leading and trailing days of the neighbouring months are muted. */
export function calendarCells(v: CalendarView): CalendarCell[] {
  const first = new Date(Date.UTC(v.y, v.m, 1)).getUTCDay()
  const dim = Number(lastDayOfMonthISO(v.y, v.m + 1).slice(8, 10))
  const prevDim = Number(lastDayOfMonthISO(v.y, v.m).slice(8, 10))
  const cells: CalendarCell[] = []
  for (let p = 0; p < first; p++) cells.push({ day: prevDim - first + 1 + p, iso: '', kind: 'muted', eom: false })
  for (let d = 1; d <= dim; d++) {
    cells.push({ day: d, iso: `${v.y}-${pad2(v.m + 1)}-${pad2(d)}`, kind: 'day', eom: d === dim })
  }
  const trailing = (7 - ((first + dim) % 7)) % 7
  for (let t = 1; t <= trailing; t++) cells.push({ day: t, iso: '', kind: 'muted', eom: false })
  return cells
}

// ------------------------------------------------------------------- misc

export function criteriaOf(s: {
  keyIso: string
  companies: readonly string[]
  rfhaText: string
  bp: string
  pair: string
  dealType: DealType
}): Criteria {
  return {
    keyIso: s.keyIso,
    companies: s.companies,
    rfhaRanges: parseRfhaFilter(s.rfhaText),
    bp: s.bp,
    pair: s.pair,
    dealType: s.dealType,
  }
}

/** The Company Code box text: nothing, "All (n)" or the codes. */
export function companyDisplay(selected: readonly string[], total: number): string {
  if (selected.length === 0) return ''
  if (selected.length === total) return `All (${total})`
  return selected.join(', ')
}
