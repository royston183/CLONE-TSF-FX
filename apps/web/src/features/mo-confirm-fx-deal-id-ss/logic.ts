/**
 * The legacy page's DataService and CALCULATIONS sections, as pure functions. Everything that
 * changed a deal in place in the original returns a new deal here; the screen swaps it into
 * its deal database, which is what the original's shared DEAL_DB objects amounted to.
 */
import { round2 } from './format.ts'
import type { Deal, DealDb, DmsDoc, Invoice, Leg, PlRow, PremiumAdjustment, ToolbarCode } from './types.ts'

/** Mocked RBI reference rate lookup (BAPI_EXCHANGERATE_GETDETAIL). */
export const RBI_RATE = 90.42

/** Deal ID search: id, reference, MC ref, trader code/description and FX model. Empty term lists all. */
export function searchDeals(db: DealDb, term: string): Deal[] {
  const t = (term || '').trim().toLowerCase()
  return Object.values(db).filter((d) => {
    const hay = `${d.dealId} ${d.dealRef} ${d.mcRefNo} ${d.traderCode} ${d.traderDesc} ${d.fxModel}`.toLowerCase()
    return !t || hay.includes(t)
  })
}

/** Mirrors FORM premium_adjustments. */
export function computePremiumAdjustment(deal: Deal): PremiumAdjustment {
  let lnet = 0
  deal.legs.forEach((l) => {
    lnet += l.fxPl + l.setPl
  })
  lnet = round2(lnet)

  // Strike rate sourced from the D2 leg (falls back to the all-in rate)
  const d2 = deal.legs.find((l) => l.dealType === 'D2')
  const first = deal.legs[0]
  let srate = 0
  if (d2) srate = d2.strike || d2.allInRate || 0
  else if (first) srate = first.strike || first.allInRate || 0

  const rbi = RBI_RATE
  const damt = first ? first.amt2 || first.amt1 : 0

  const fnet = round2(lnet * rbi)
  const pnet = damt ? round2(fnet / damt) : 0
  const irate = round2(srate + pnet)

  return { damt, lnet, rbi, fnet, pnet, srate, irate }
}

/** Planned P&L: SS premium income/expense rows first, then FX and settlement P&L, then the total. */
export function buildPlRows(deal: Deal): PlRow[] {
  const rows: PlRow[] = []
  let fxPl = 0
  let setPl = 0
  deal.legs.forEach((l) => {
    fxPl += l.fxPl
    setPl += l.setPl
  })
  fxPl = round2(fxPl)
  setPl = round2(setPl)

  if (deal.isSS) {
    let premIncome = 0
    let premExpense = 0
    deal.legs.forEach((l) => {
      if (l.premAmt > 0) premIncome += l.premAmt
      else premExpense += l.premAmt
    })
    rows.push({ type: 'Option Premium Income', amtLocal: round2(premIncome), amtUsd: round2(premIncome) })
    rows.push({ type: 'Option Premium Expense', amtLocal: round2(premExpense), amtUsd: round2(premExpense) })
  }
  rows.push({ type: 'FX Deal P&L', amtLocal: fxPl, amtUsd: round2(fxPl / 90) })
  rows.push({ type: 'Settlement P&L', amtLocal: setPl, amtUsd: round2(setPl / 90) })

  let totalLocal = 0
  let totalUsd = 0
  rows.forEach((r) => {
    totalLocal += r.amtLocal
    totalUsd += r.amtUsd
  })
  rows.push({ type: 'Total P&L', amtLocal: round2(totalLocal), amtUsd: round2(totalUsd), total: true })
  return rows
}

/**
 * The toolbar's buttons, in order (SET PF-STATUS EXCLUDING): hidden buttons are simply absent.
 * UPD / DEAL_EDIT / CAN need status 01 (DEAL_EDIT also a selected leg); SS_DEALLOC and SS_DEAL
 * only exist on a Short Straddle deal in 01; REV needs 02/03 and the unwind authorisation;
 * PRE, DMS and REF are always there.
 */
export function toolbarButtons(deal: Deal, selectedLegRfha: string | null): ToolbarCode[] {
  const status01 = deal.status === '01'
  const status0203 = deal.status === '02' || deal.status === '03'
  const out: ToolbarCode[] = []
  if (status01) out.push('UPD')
  out.push('PRE')
  if (status01 && !!selectedLegRfha) out.push('DEAL_EDIT')
  if (status01) out.push('CAN')
  if (deal.isSS && status01) out.push('SS_DEALLOC', 'SS_DEAL')
  if (status0203 && deal.reversalAuthorized) out.push('REV')
  out.push('DMS', 'REF')
  return out
}

/** Invoice and P&L cards are hidden for no-invoice models and for deassigned / SS-deallocated deals. */
export function invoicesVisible(deal: Deal): boolean {
  return !deal.noInvoiceModel && deal.status !== '30' && deal.status !== '50'
}

/** Exchange rates can only be edited while the deal is Pending Confirmation. */
export function invoicesEditable(deal: Deal): boolean {
  return deal.status === '01'
}

/** The leg an invoice line belongs to: its TRM reference starts with the leg's transaction no. */
export function legForInvoice(deal: Deal, inv: Invoice): Leg | undefined {
  return deal.legs.find((l) => inv.trmRef.startsWith(l.rfha))
}

/** Confirm guard: the first leg that is not yet settlement-ready (txn status below 07), if any. */
export function firstUnreadyLeg(deal: Deal): Leg | undefined {
  return deal.legs.find((l) => l.txnStatus < '07')
}

/**
 * The rates the original read back from the invoice-plan inputs on Confirm: one per input,
 * keyed by the input's leg ('' when the line has no leg), parseFloat or 0, later lines winning.
 */
export function collectRates(deal: Deal, rateTexts: readonly string[]): Record<string, number> {
  const rates: Record<string, number> = {}
  deal.invoices.forEach((inv, i) => {
    const key = legForInvoice(deal, inv)?.rfha ?? ''
    rates[key] = parseFloat(rateTexts[i] ?? '') || 0
  })
  return rates
}

/** Mock persistence of edited rates: each leg's rate goes to the first invoice line under it. */
export function saveInvoiceRates(deal: Deal, rates: Record<string, number>): Deal {
  const invoices = deal.invoices.slice()
  deal.legs.forEach((l) => {
    const rate = rates[l.rfha]
    if (rate === undefined) return
    const idx = invoices.findIndex((i) => i.trmRef.startsWith(l.rfha))
    const inv = invoices[idx]
    if (inv) invoices[idx] = { ...inv, exRate: rate }
  })
  return { ...deal, invoices }
}

/** Stays pending until MO explicitly confirms via workflow; ready legs flip txn_status. */
export function confirmInvoicePlan(deal: Deal): Deal {
  return { ...deal, status: '01' }
}

export function reverseMoConfirmation(deal: Deal): Deal {
  return { ...deal, status: '01', invoices: [] }
}

export function cancelDealId(deal: Deal): Deal {
  return { ...deal, status: '30' }
}

export function ssDeallocate(deal: Deal): Deal {
  return { ...deal, status: '50' }
}

export function updateDealPair(deal: Deal, oldRfha: string | null, newRfha: string): Deal {
  const idx = deal.legs.findIndex((x) => x.rfha === oldRfha)
  const l = deal.legs[idx]
  if (!l) return deal
  const legs = deal.legs.slice()
  legs[idx] = { ...l, rfha: newRfha }
  return { ...deal, legs }
}

/** Clicking a leg selects it; clicking the selected leg again clears the selection. */
export function toggleLeg(current: string | null, rfha: string): string | null {
  return current === rfha ? null : rfha
}

/** Company code shown on Edit Deal Pair: the first part of the entity string. */
export function companyCode(deal: Deal): string {
  return deal.entityString.split('-')[0] || '—'
}

/** DMS mock upload: the next Supporting_Doc_N.pdf. */
export function uploadDoc(docs: readonly DmsDoc[], date: string): DmsDoc[] {
  return [...docs, { name: `Supporting_Doc_${docs.length + 1}.pdf`, cat: 'Supporting', by: 'you', date }]
}

export function removeDoc(docs: readonly DmsDoc[], index: number): DmsDoc[] {
  return docs.filter((_, i) => i !== index)
}
