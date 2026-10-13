/*
 * The FX-Invoice Difference (screen 9006) of MO: Execute Settlement for Deal ID, as ZSGTSF_RDEAL_TRD_INV codes it in
 * INCLUDE ..._DIFF_NEW:
 *
 *   PROCESS_DATA_NEW   one row per planned invoice (ZSGTSFTR_INV_REF): planned amount, final invoice amount
 *                      (ZSGTSFTR_BIL_ADJ), the deal amount of the D1 / D2 it maps to, the three differences, the
 *                      company and buy / sell of the spot (ZSGTSFTR_SET_SPT / _TSF_PAY) and whether it was saved before.
 *   SAVE_SPOT_DATA_NEW (the SPOT button) MODIFYs ZSGTSFTR_IN_SPOT from those rows — it saves the difference only. It books
 *                      no SAP transaction and sets neither ZSPOT_TXN nor ZSPOT_CREATE: the FO workbench reads the rows and
 *                      creates the spot later.
 *
 * Everything here is pure; api.ts reads the tables and writes the rows.
 */
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxDeal, TradeInvoice } from './types.ts'

const USD = 'USD'
/** c_buy / c_sell of the program: the words, not B / S. */
const BUY = 'Buy'
const SELL = 'Sell'

const num = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const round2 = (v: number): number => Math.round(v * 100) / 100

/** The deal types of settlement spots: they are not part of the difference's own D1 / D2 count. */
const SPOT_DEAL_TYPES = new Set(['DS1', 'DS2', 'DSS1', 'DSS2', ''])
/** TEXT-102: a forward (transaction type 619) is not saved by the second loop. */
const FORWARD_TXN_TYPE = '619'

/** One row of GT_DIFF_N. */
export type DiffRow = {
  ttype: string
  invCurr: string
  planAmt: number
  finalAmt: number
  dealType: string
  dealAmt: number
  diffAmt: number
  diff2Amt: number
  deal3Type: string
  deal3Amt: number
  diff3Amt: number
  /** ZSBUKRS / ZBS: the company that books the spot and whether it buys or sells the invoice currency. */
  sbukrs: string
  bs: string
  /** COLOR C500: an IN_SPOT row of this deal type already exists, so the row is not saved again. */
  saved: boolean
}

export type DiffInput = {
  /** gv_mod: the Master Contract's model (ZMOD_ID). */
  model: string
  dealId: string
  /** gt_top: the Deal ID's FX legs, amounts absolute as ZSGTSFCDS_FX is read here. */
  fxDeals: readonly FxDeal[]
  /** gt_inv: the model's ZSGTSFTR_SET_TYP legs. */
  invoices: readonly TradeInvoice[]
  /** ZSGTSFTR_INV_REF of the Deal ID. */
  invRef: readonly FxRow[]
  /** ZSGTSFTR_BIL_ADJ of the Deal ID. */
  billAdj: readonly FxRow[]
  /** ZSGTSFTR_RULE_BT rows of the model (the invoice links, ZD1_PUT_CALL). */
  rules: readonly FxRow[]
  /** ZSGTSFTR_SET_SPT rows of the model: ZSIGN, ZD1_BUKRS / ZD1_BCURR, ZD2_BUKRS / ZD2_BCURR. */
  setSpt: readonly FxRow[]
  /** ZSGTSFTR_TSF_PAY rows of the model; only the first is read. Empty when it cannot be read. */
  tsfPay: readonly FxRow[]
  /** ZSGTSFTR_IN_SPOT rows of the Deal ID. */
  existing: readonly FxRow[]
}

/** CHAR+1(1) of a link such as '01' (its digit), compared to the count of the invoice being looked at. */
const linkDigit = (link: string): string => link.slice(1, 2)

/** SELECT SINGLE on RULE_BT: a model carries several rows; the one that carries invoice links is the one the plan uses. */
function pickLinks(rules: readonly FxRow[], optionLegs: boolean): FxRow | undefined {
  if (optionLegs) return rules.find((r) => num(r['ZD1_PUT_CALL']) === 1)
  return rules.find((r) => txt(r, 'ZD1_INV_LINK') !== '') ?? rules[0]
}

/** PROCESS_DATA_NEW. */
export function computeDifferences(inp: DiffInput): DiffRow[] {
  const lines = inp.fxDeals.filter((f) => !SPOT_DEAL_TYPES.has(f.dealType)).length
  const mod = pickLinks(inp.rules, lines > 2)
  const link1 = mod ? txt(mod, 'ZD1_INV_LINK') : ''
  const link1b = mod ? txt(mod, 'ZD1_INV_LINK2') : ''
  const link2 = mod ? txt(mod, 'ZD2_INV_LINK') : ''
  const link2b = mod ? txt(mod, 'ZD2_INV_LINK2') : ''
  const top = (type: string) => inp.fxDeals.find((f) => f.dealType === type)
  const dealAmountIn = (leg: FxDeal | undefined, curr: string): number => (leg ? (leg.curr1 === curr ? Math.abs(leg.amt1) : Math.abs(leg.amt2)) : 0)
  const set = (sign: string) => inp.setSpt.find((r) => txt(r, 'ZSIGN') === sign)
  const spt = inp.tsfPay[0]

  const planned = [...inp.invRef].sort((a, b) => (txt(a, 'ZTTYPE') < txt(b, 'ZTTYPE') ? -1 : txt(a, 'ZTTYPE') > txt(b, 'ZTTYPE') ? 1 : 0))
  const out: DiffRow[] = []
  let count = 0
  for (const p of planned) {
    count += 1
    const ttype = txt(p, 'ZTTYPE')
    const invCurr = txt(p, 'ZTRD_CURR')
    const row: DiffRow = {
      ttype,
      invCurr,
      planAmt: invCurr === USD ? num(p['ZAMT']) : num(p['ZINV_AMT']),
      finalAmt: 0,
      dealType: '',
      dealAmt: 0,
      diffAmt: 0,
      diff2Amt: 0,
      deal3Type: '',
      deal3Amt: 0,
      diff3Amt: 0,
      sbukrs: '',
      bs: '',
      saved: false,
    }
    const digit = String(count)
    if (linkDigit(link1) === digit || linkDigit(link1b) === digit) {
      row.dealAmt = dealAmountIn(top('D1'), invCurr)
      row.dealType = 'D1'
    } else if (linkDigit(link2) === digit || linkDigit(link2b) === digit) {
      row.dealAmt = dealAmountIn(top('D2'), invCurr)
      row.dealType = 'D2'
    }
    out.push(row)
  }

  for (const row of out) {
    // Final invoice amount: the USD amount of the bill adjustments in USD, else their own amount.
    row.finalAmt = inp.billAdj
      .filter((b) => txt(b, 'ZINV_REF').slice(11, 13) === row.ttype)
      .reduce((sum, b) => sum + num(b[row.invCurr === USD ? 'ZAMT_USD' : 'ZAMT']), 0)
    row.diffAmt = round2(row.planAmt - row.finalAmt)
    row.diff2Amt = round2(row.dealAmt - row.finalAmt)

    // Trade-wise deal 3: the seller leg of the trade carries the D-map of the spot's deal.
    const sellLeg = inp.invoices.find((i) => i.leg.slice(3, 4) === 'S' && i.leg.slice(0, 2) === row.ttype)
    if (sellLeg) {
      row.deal3Type = sellLeg.dMap ?? ''
      const t = top(row.deal3Type)
      if (t) {
        row.deal3Amt = dealAmountIn(t, sellLeg.curr)
        row.diff3Amt = round2(row.deal3Amt - row.finalAmt)
      }
    }

    const sign = row.diffAmt < 0 ? '-' : '+'
    const setRow = set(sign)
    if (setRow) {
      const slot = row.dealType.slice(1, 2)
      if (slot === '1') {
        row.sbukrs = txt(setRow, 'ZD1_BUKRS')
        row.bs = txt(setRow, 'ZD1_BCURR') === row.invCurr ? BUY : SELL
      } else if (slot === '2') {
        row.sbukrs = txt(setRow, 'ZD2_BUKRS')
        row.bs = txt(setRow, 'ZD2_BCURR') === row.invCurr ? BUY : SELL
      }
    }
    if (spt) {
      const slot = row.deal3Type.slice(2, 3)
      if (slot === '1') {
        row.sbukrs = txt(spt, 'ZD1_BUKRS')
        row.bs = txt(spt, 'ZD1_BCURR') === row.invCurr ? BUY : SELL
      } else if (slot === '2') {
        row.sbukrs = txt(spt, 'ZD2_BUKRS')
        row.bs = txt(spt, 'ZD2_BCURR') === row.invCurr ? BUY : SELL
      }
    }

    // Saved before: by deal type only, as the program checks it (its own type, then the spot's).
    row.saved = inp.existing.some((e) => txt(e, 'ZDEAL_TYPE') === row.dealType) || inp.existing.some((e) => txt(e, 'ZDEAL_TYPE') === row.deal3Type)
  }
  return out
}

/** The IN_SPOT row of SAVE_SPOT_DATA_NEW, its key first. Amounts are numbers; api.ts formats them. */
export type InSpotRow = {
  ZMOD_ID: string
  ZDEAL_ID: string
  ZDEAL_TYPE: string
  ZDSS_TYPE: string
  ZBUKRS: string
  ZRFHA: string
  ZT_TYPE: string
  ZF_AMT: number
  ZFX_AMT: number
  ZCURR: string
  ZD_AMT: number
  ZSBUKRS: string
  ZBS: string
}

/** Deal 3 amount (else the deal amount) and difference 3 (else difference 2): what the row stores. */
const amounts = (d: DiffRow): { fx: number; diff: number } => ({
  fx: d.deal3Amt !== 0 ? d.deal3Amt : d.dealAmt,
  diff: d.diff3Amt !== 0 ? d.diff3Amt : d.diff2Amt,
})

/**
 * SAVE_SPOT_DATA_NEW: first the invoice legs mapped to a DSS deal, then every non-forward FX leg; a row whose deal type
 * is already saved is skipped, and a row with neither a deal type nor a DSS type is dropped. A row repeated for the same
 * key keeps the last one, as MODIFY from a table does.
 */
export function rowsToSave(inp: DiffInput, diffs: readonly DiffRow[]): InSpotRow[] {
  const rows: InSpotRow[] = []
  // lv_len is not reset between legs in the program: a leg with no FX row keeps the previous length.
  let len = 0

  for (const inv of inp.invoices) {
    if ((inv.dssDeal ?? '').slice(0, 3) !== 'DSS') continue
    const map = inv.dMap ?? ''
    const top = inp.fxDeals.find((f) => f.dealType === map)
    if (top) len = map.length
    const diff = len === 2 ? diffs.find((d) => d.dealType === map && d.invCurr === inv.curr) : diffs.find((d) => d.deal3Type === map && d.invCurr === inv.curr)
    if (!diff || diff.saved) continue
    const a = amounts(diff)
    rows.push({
      ZMOD_ID: inp.model,
      ZDEAL_ID: inp.dealId,
      ZDEAL_TYPE: map,
      ZDSS_TYPE: inv.dssDeal ?? '',
      ZBUKRS: top?.bukrs ?? '',
      ZRFHA: top?.rfha ?? '',
      ZT_TYPE: diff.ttype,
      ZF_AMT: diff.finalAmt,
      ZFX_AMT: a.fx,
      ZCURR: diff.invCurr,
      ZD_AMT: a.diff,
      ZSBUKRS: diff.sbukrs,
      ZBS: diff.bs,
    })
  }

  for (const top of inp.fxDeals) {
    if ((top.txnType ?? '').slice(0, 3) === FORWARD_TXN_TYPE) continue
    len = top.dealType.length
    const diff =
      len === 2
        ? diffs.filter((d) => d.deal3Type !== '').find((d) => d.dealType === top.dealType)
        : diffs.find((d) => d.deal3Type === top.dealType)
    if (!diff || diff.saved) continue
    const a = amounts(diff)
    rows.push({
      ZMOD_ID: inp.model,
      ZDEAL_ID: inp.dealId,
      ZDEAL_TYPE: top.dealType,
      ZDSS_TYPE: '',
      ZBUKRS: '',
      ZRFHA: '',
      ZT_TYPE: diff.ttype,
      ZF_AMT: diff.finalAmt,
      ZFX_AMT: a.fx,
      ZCURR: diff.invCurr,
      ZD_AMT: a.diff,
      ZSBUKRS: diff.sbukrs,
      ZBS: diff.bs,
    })
  }

  const byKey = new Map<string, InSpotRow>()
  for (const r of rows) {
    if (r.ZDEAL_TYPE === '' && r.ZDSS_TYPE === '') continue
    byKey.set(`${r.ZMOD_ID}|${r.ZDEAL_ID}|${r.ZDEAL_TYPE}|${r.ZDSS_TYPE}`, r)
  }
  return [...byKey.values()]
}

/** TEXT-016 / TEXT-103. */
export const SAVED_MESSAGE = 'Details Saved Successfully..'
export const ALREADY_SAVED_MESSAGE = 'Data already saved..'
