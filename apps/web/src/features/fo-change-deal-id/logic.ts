/**
 * Pure business rules and service stand-ins of the legacy page. The svc* functions there
 * mutated the in-page deal table; here they return a new store instead.
 */
import { CANCELLED_STATUS, MATCHED_COLOR, OPEN_STATUS, PL_ROW_FACTORS, PL_ROW_LABELS, STATUS_MAP } from './data.ts'
import { fixed4, fmtAmt, fmtRate } from './format.ts'
import type { Deal, DealStore, Field, InvoiceLine, MasterContract, PlCell, PlTable, Premium, StatusMeta, TopRow } from './types.ts'

export function statusMeta(code: string): StatusMeta {
  return STATUS_MAP[code] ?? { label: code, css: 'pill-gray' }
}

/** The status shown on an FX deal leg: '02' and '03' both show as Confirmed, anything else Open. */
export function legStatus(r: TopRow): string {
  // '' = the source gave no TXN_STATUS: unknown, not Open.
  if (r.txnStatus === '') return ''
  return r.txnStatus === '02' ? '02' : r.txnStatus === '03' ? '02' : '01'
}

function cloneDeal(d: Deal): Deal {
  return structuredClone(d)
}

/** svcSearchDeals: the first six deals for an empty term, else a match on ID, entity string, trader or MC. */
export function searchDeals(store: DealStore, term: string): Deal[] {
  const t = (term || '').trim().toLowerCase()
  const all = Object.keys(store).map((id) => store[id] as Deal)
  if (!t) return all.slice(0, 6)
  return all.filter(
    (d) =>
      d.dealId.toLowerCase().includes(t) ||
      d.entStr.toLowerCase().includes(t) ||
      d.trdDesc.toLowerCase().includes(t) ||
      d.mcRef.toLowerCase().includes(t),
  )
}

/** svcLoadDeal: a private copy the workbench can edit without touching the store. */
export function loadDeal(store: DealStore, dealId: string): Deal | null {
  const d = store[dealId]
  return d ? cloneDeal(d) : null
}

function patchDeal(store: DealStore, dealId: string, patch: (d: Deal) => Deal): DealStore {
  const d = store[dealId]
  return d ? { ...store, [dealId]: patch(d) } : store
}

export function cancelDeal(store: DealStore, dealId: string): DealStore {
  return patchDeal(store, dealId, (d) => ({ ...d, status: CANCELLED_STATUS }))
}

export function updateMcRef(store: DealStore, dealId: string, mcRef: string, mcDesc: string): DealStore {
  return patchDeal(store, dealId, (d) => ({ ...d, mcRef, mcDesc }))
}

/** svcUpdateDealPair: new transaction number plus the matched/updated marker. */
export function updateDealPair(store: DealStore, dealId: string, topIndex: number, rfha: string): DealStore {
  return patchDeal(store, dealId, (d) => ({
    ...d,
    top: d.top.map((r, i) => (i === topIndex ? { ...r, rfha, color: MATCHED_COLOR } : r)),
  }))
}

/** function_button excludes UPD/CAN/DEAL_EDIT unless the deal status is 01. */
export function isDealOpen(d: Deal): boolean {
  return d.status === OPEN_STATUS
}

/** The invoice plan and P&L cards are hidden for status 30 (no-invoice / cancelled). */
export function showsInvoicePl(d: Deal): boolean {
  return d.status !== CANCELLED_STATUS
}

/**
 * Business rule (F01:463-475): every FX deal leg must already be matched (color set) or
 * have txn_status = '03' before the MC Ref No can be confirmed/updated.
 */
export function isMcChangeBlocked(d: Deal): boolean {
  return d.top.some((r) => r.txnStatus !== '03' && !r.color)
}

/**
 * A leg whose TXN_STATUS the source does not carry cannot be shown to be matched, so the rule
 * above cannot be passed. Kept apart so the message says what is missing rather than that the
 * legs are "not yet matched".
 */
export function hasUnverifiedLegs(d: Deal): boolean {
  return d.top.some((r) => r.txnStatus === '' && !r.color)
}

export const MC_STATUS_UNKNOWN_MSG =
  'Unable to update the MC Ref No – the status of the FX deal legs cannot be read (a leg is in neither the SAP FX transaction service nor ZSGTSFV_FX), so they cannot be shown to be matched.'

/**
 * The new MC has to carry the deal's own FX model, entity string and currency string: the
 * Deal ID keeps its model (ZTSF_MODEL) when only ZMC_REF changes. Null when it is acceptable.
 */
export function mcChangeError(d: Deal, mc: MasterContract): string | null {
  if (mc.model !== undefined && d.modId && mc.model !== d.modId) return `MC ${mc.ref} is under FX model ${mc.model}; this Deal ID is under ${d.modId}.`
  if (mc.entstr && d.entStr && mc.entstr !== d.entStr) return `MC ${mc.ref} has entity string ${mc.entstr}; this Deal ID has ${d.entStr}.`
  if (mc.currStr && d.currStr && mc.currStr !== d.currStr) return `MC ${mc.ref} has currency string ${mc.currStr}; this Deal ID has ${d.currStr}.`
  return null
}

export const MC_CHANGE_BLOCKED_MSG = 'Unable to update the MC Ref No – one or more FX deal legs are not yet matched.'
export const NEW_RFHA_REQUIRED_MSG = 'Please enter the new transaction number.'
export const CANCEL_CONFIRM_MSG = 'FX Deal ID Deassigned Completely. Do you want to confirm?'

/** The Edit Deal Pair validation: the trimmed new transaction number, or an error. */
export function validateNewRfha(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = value.trim()
  return v ? { ok: true, value: v } : { ok: false, error: NEW_RFHA_REQUIRED_MSG }
}

/** onExRateChange: `parseFloat(val) || 0`, rounded to the four decimals a rate carries. */
export function parseExRate(text: string): number {
  return Math.round((parseFloat(text) || 0) * 1e4) / 1e4
}

export function setExRate(inv: InvoiceLine[], idx: number, text: string): InvoiceLine[] {
  return inv.map((r, i) => (i === idx ? { ...r, exRate: parseExRate(text) } : r))
}

/** Calculate: invoice amount = USD amount × exchange rate, for every line. */
export function recalculateInvoices(inv: InvoiceLine[]): InvoiceLine[] {
  return inv.map((r) => ({ ...r, invAmt: r.amt * r.exRate }))
}

export function traderLabel(d: Deal): string {
  return `${d.trdCode} – ${d.trdDesc}`
}

export function summaryFields(d: Deal): Field[] {
  return [
    ['Deal Start Date', d.sDate],
    ['Deal End Date', d.eDate],
    ['MC Ref No', d.mcRef],
    ['MC Description', d.mcDesc],
    ['MC Date', d.mcDate],
    ['Ship Start Date', d.shipStart],
    ['Ship End Date', d.shipEnd],
    ['FX Model ID', d.modId],
    ['Model Description', d.modDesc],
    ['Entity String', d.entStr],
    ['Currency String', d.currStr],
    ['Trader', traderLabel(d)],
  ]
}

export function txnFields(r: TopRow): Field[] {
  const ndf: Field[] =
    /NDF/i.test(r.xtext) || r.ndfDate || r.ndfRef || r.ndfRate || r.cashAmt || r.cashCurr
      ? [
          ['NDF Fixing Date', r.ndfDate ?? ''],
          ['NDF Ref', r.ndfRef ?? ''],
          ['NDF Settlement Rate', fmtRate(r.ndfRate ?? '')],
          ['Cash Settlement Amount', fmtAmt(r.cashAmt)],
          ['Cash Currency', r.cashCurr ?? ''],
        ]
      : []
  return [
    ['Company Code', r.bukrs],
    ['Transaction No', r.rfha],
    ['Deal Type', r.sfhaart],
    ['Product Type', r.dealType],
    ['Business Partner', r.bpName],
    ['BP Number', r.kontrh],
    ['Buy/Sell 1', `${r.bs1} ${r.curr1}`],
    ['Amount 1', fmtAmt(r.amt1)],
    ['Buy/Sell 2', `${r.bs2} ${r.curr2}`],
    ['Amount 2', fmtAmt(r.amt2)],
    ['Deal Start', r.dblfz],
    ['Deal Valid To', r.delfz],
    ...ndf,
  ]
}

/** Screen 9003, read-only. A deal with no lookup row shows empty values. */
export function premiumFields(p: Premium | undefined): Field[] {
  return [
    ['Deal Value', `${fmtAmt(p?.dAmt)} ${p?.dCurr ?? ''}`],
    ['Net Premium (Local)', `${fmtAmt(p?.lNet)} ${p?.lCurr ?? ''}`],
    ['RBI Rate', fixed4(p?.rbi)],
    ['RBI Date', p?.rbiDate || '–'],
    ['Net Premium (Foreign)', `${fmtAmt(p?.fNet)} ${p?.fCurr ?? ''}`],
    ['Net Premium per USD', fixed4(p?.pNet)],
    ['Strike Rate', fixed4(p?.sRate)],
    ['Invoice Rate', fixed4(p?.iRate)],
  ]
}

function plCell(value: number): PlCell {
  return { value, text: fmtAmt(value), negative: value < 0 }
}

/**
 * The Planned P&L table: one Buy/Sell amount column per invoice leg (ztrd_sell '-'
 * currency), each row a deterministic mock figure proportional to the leg's invoice amount.
 */
export function buildPlTable(inv: InvoiceLine[]): PlTable {
  if (inv.length === 0) return { empty: true }
  const headers = inv.map((r) => `${r.sell}-${r.curr} Amt`)
  const totals = inv.map(() => 0)
  const rows = PL_ROW_LABELS.map((label, rIdx) => {
    const factor = PL_ROW_FACTORS[rIdx] || 0
    const vals = inv.map((r) => r.invAmt * factor)
    vals.forEach((v, i) => {
      totals[i] = (totals[i] ?? 0) + v
    })
    return { label, cells: vals.map(plCell) }
  })
  return { empty: false, headers, rows, totals: totals.map(plCell), count: PL_ROW_LABELS.length }
}
