/**
 * The page's rules and mock service calls, as pure functions. Where the original mutated
 * DEALS_DB / DMS_DB in place, these return the next value and leave their input untouched.
 */
import { STATUS_META } from './data.ts'
import type {
  ActionVisibility,
  Deal,
  DmsDb,
  EditDraft,
  Leg,
  PlRow,
  Premium,
  ServiceResult,
  Sort,
  SortKey,
  StatusMeta,
} from './types.ts'

/** parseInt(code, 10) || 0. */
export function numStatus(code: string): number {
  return parseInt(code, 10) || 0
}

/** STATUS_META lookup with the badge's fallback for an unknown code. */
export function statusMeta(code: string): StatusMeta {
  return STATUS_META[code] ?? { desc: code, cls: 'status-01' }
}

/** A quick pick's text: "FXD2026001 · Created". */
export function quickPickLabel(deal: Deal): string {
  return `${deal.dealId} · ${statusMeta(deal.status).desc}`
}

/**
 * Mirrors ABAP FUNCTION_BUTTON / SET PF-STATUS '111' EXCLUDING logic:
 * UPD / CAN / DEAL_EDIT only while status = 01 (Created); REV only while 02 or 03;
 * PRE / REF / DMS always; the SS button only for a short-straddle deal.
 */
export function actionVisibility(deal: Deal): ActionVisibility {
  const s = deal.status
  return {
    upd: s === '01',
    can: s === '01',
    dealEdit: s === '01',
    rev: s === '02' || s === '03',
    pre: true,
    ref: true,
    dms: true,
    ssDeal: deal.ssDeal === true,
  }
}

/** Load Deal's lookup: trims and uppercases the typed id. */
export function resolveDealId(
  input: string,
  deals: readonly Deal[],
): { ok: true; id: string } | { ok: false; error: string } {
  const id = input.trim().toUpperCase()
  if (!id) return { ok: false, error: 'Enter a Deal ID.' }
  if (!deals.some((d) => d.dealId === id)) {
    return { ok: false, error: 'Deal ID not found. Try one of the quick picks below.' }
  }
  return { ok: true, id }
}

function sortValue(leg: Leg, key: SortKey): string | number | undefined {
  if (key === 'txnStatusDesc') return statusMeta(leg.txnStatus).desc
  // "MC Ref No" carries a data-key but is not a leg field, so every row compares equal.
  if (key === 'mcRef') return undefined
  return leg[key]
}

/** The FX Deals table's rows: the search box filters, then the clicked header sorts. */
export function sortedFilteredLegs(legs: readonly Leg[], search: string, sort: Sort): Leg[] {
  let out = legs.slice()
  const q = search.trim().toLowerCase()
  if (q) {
    out = out.filter((l) => (l.rfha + l.dealType + l.bpName + l.curr1 + l.curr2 + l.desc).toLowerCase().includes(q))
  }
  const { key, dir } = sort
  if (key) {
    out.sort((a, b) => {
      const av = sortValue(a, key)
      const bv = sortValue(b, key)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }
  return out
}

/** A header click: the same key flips direction, a new key sorts ascending. */
export function nextSort(sort: Sort, key: SortKey): Sort {
  if (sort.key === key) return { key, dir: sort.dir === 1 ? -1 : 1 }
  return { key, dir: 1 }
}

/** Clicking the selected leg again deselects it. */
export function toggleLeg(selected: string | null, rfha: string): string | null {
  return selected === rfha ? null : rfha
}

export function legRowClass(leg: Leg, selected: boolean): string {
  return [leg.txnStatus === '02' ? 'row-pending' : '', selected ? 'row-selected' : ''].filter(Boolean).join(' ')
}

/** The hint beside the leg search. It keeps its longer drag hint until a leg is first clicked. */
export function legNote(selected: string | null, touched: boolean): string {
  if (selected) return `Leg ${selected} selected`
  return touched
    ? 'Select a leg to enable Edit Deal Pair'
    : 'Select a leg to enable Edit Deal Pair · drag it onto Edit Deal Pair'
}

function mapDeal(deals: readonly Deal[], dealId: string, fn: (d: Deal) => Deal): Deal[] {
  return deals.map((d) => (d.dealId === dealId ? fn(d) : d))
}

/** Change / Confirm (UPD): every leg must already be at 07 or beyond. */
export function saveConfirmDeal(deals: readonly Deal[], dealId: string, payload: { mcRef: string }): ServiceResult {
  const deal = deals.find((d) => d.dealId === dealId)
  if (!deal) return { ok: false, msg: 'Deal not found.' }
  const blocking = deal.legs.find((l) => numStatus(l.txnStatus) < 7)
  if (blocking) return { ok: false, msg: `Transaction ${blocking.rfha} is not yet ready to be confirmed.` }
  return {
    ok: true,
    msg: 'Deal Confirmed Successfully',
    deals: mapDeal(deals, dealId, (d) => ({
      ...d,
      status: '07',
      legs: d.legs.map((l) => ({ ...l, txnStatus: '07' })),
      mcRef: payload.mcRef || d.mcRef,
    })),
  }
}

/** Cancel Deal ID (CAN): the deal is deassigned completely — removed from the list. */
export function cancelDealId(deals: readonly Deal[], dealId: string): ServiceResult {
  if (!deals.some((d) => d.dealId === dealId)) return { ok: false, msg: 'Deal not found.' }
  return { ok: true, msg: 'FX Deal ID deassigned successfully.', deals: deals.filter((d) => d.dealId !== dealId) }
}

/** Reverse MO Confirmation (REV): only from 02 or 03; deal and legs go back to 01. */
export function reverseMoConfirmation(deals: readonly Deal[], dealId: string): ServiceResult {
  const deal = deals.find((d) => d.dealId === dealId)
  if (!deal) return { ok: false, msg: 'Deal not found.' }
  if (deal.status !== '02' && deal.status !== '03') return { ok: false, msg: 'Selected Deal ID cannot be reversed.' }
  return {
    ok: true,
    msg: 'MO Confirmation has been reversed successfully.',
    deals: mapDeal(deals, dealId, (d) => ({ ...d, status: '01', legs: d.legs.map((l) => ({ ...l, txnStatus: '01' })) })),
  }
}

/** Edit Deal Pair (DEAL_EDIT): the old leg takes the replacement transaction's number. */
export function updateDealPair(deals: readonly Deal[], dealId: string, oldRfha: string, newRfha: string): ServiceResult {
  if (!deals.some((d) => d.dealId === dealId)) return { ok: false, msg: 'Deal not found.' }
  return {
    ok: true,
    msg: 'Deal pair updated successfully.',
    deals: mapDeal(deals, dealId, (d) => ({
      ...d,
      legs: d.legs.map((l) => (l.rfha === oldRfha ? { ...l, rfha: newRfha } : l)),
    })),
  }
}

/** A fresh Edit Deal Pair draft: the select starts locked with nothing chosen. */
export function newEditDraft(oldRfha: string): EditDraft {
  return { oldRfha, editing: false, newRfha: '' }
}

/** The Edit / Editing… toggle. The chosen replacement stays as it was, as the select's value did. */
export function toggleEditing(draft: EditDraft): EditDraft {
  return { ...draft, editing: !draft.editing }
}

/** Deal Update is enabled only once a replacement is chosen. */
export function canUpdatePair(draft: EditDraft): boolean {
  return draft.newRfha !== ''
}

/** The mock DMS upload: appends Supporting_Doc_<n>.pdf to the deal's documents. */
export function attachMockDocument(dms: DmsDb, dealId: string): DmsDb {
  const docs = dms[dealId] ?? []
  return { ...dms, [dealId]: [...docs, { name: `Supporting_Doc_${docs.length + 1}.pdf`, type: 'Attachment' }] }
}

/**
 * Planned P&L. Sale / Purchase sum the legs by their first side; option premium comes from
 * the premium adjustment; NDF adjustment is the legs' FX P&L. The INR column converts at the
 * premium's invoice rate — with no premium record that is undefined, so those cells print "-".
 */
export function buildPlRows(deal: Deal, prem: Premium | null): PlRow[] {
  const sale = { famt: 0, lamt: 0 }
  const purchase = { famt: 0, lamt: 0 }
  for (const l of deal.legs) {
    const side = l.bs1 === 'Sell' ? sale : purchase
    side.famt += l.amt1
    side.lamt += l.amt2
  }
  const netPremium = prem?.netPremium
  const invoiceRate = prem?.invoiceRate ?? NaN
  const optIncome = netPremium !== undefined && netPremium > 0 ? netPremium : 0
  const optExpense = netPremium !== undefined && netPremium < 0 ? Math.abs(netPremium) : 0
  const ndfAdj = deal.legs.reduce((s, l) => s + l.fxPl, 0)
  const totalPl = optIncome - optExpense + ndfAdj
  const salePct = sale.lamt ? (totalPl / sale.lamt) * 100 : 0

  return [
    { type: 'Sale', famt: sale.famt, lamt: sale.lamt, cls: '', pct: false },
    { type: 'Purchase', famt: purchase.famt, lamt: purchase.lamt, cls: '', pct: false },
    { type: 'Option Premium Income', famt: optIncome, lamt: optIncome * invoiceRate, cls: '', pct: false },
    { type: 'Option Premium Expense', famt: -optExpense, lamt: -optExpense * invoiceRate, cls: '', pct: false },
    { type: 'NDF Fixing-Profit Adj', famt: ndfAdj, lamt: ndfAdj * invoiceRate, cls: '', pct: false },
    { type: 'P&L', famt: totalPl, lamt: totalPl * invoiceRate, cls: 'pl-total-row', pct: false },
    { type: 'P&L Orign(%)', famt: salePct, lamt: salePct, cls: 'pl-pct-row', pct: true },
  ]
}
