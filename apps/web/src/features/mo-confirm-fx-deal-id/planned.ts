import { invoiceRows, pnlGrid, storedInvoiceRows, type PlannedData } from '../../shared/fx/planned.ts'
import { planDeal } from './analysisConfirm.ts'
import { buildPnl, type PlanLine } from './analysisPlan.ts'
import { loadDeal } from './api.ts'
import type { Deal, Leg } from './types.ts'

/**
 * The planned trade invoices and planned P&L of one Deal ID, for every screen that shows a Deal ID (shared/fx/PlannedTables.tsx).
 *
 * The figures are the calculation Confirm FX Deal ID makes (analysisConfirm.ts `planDeal`: model rule, entity string, currency
 * string, saved invoice references, the TCURR type M rate), run for any status. A deal that has been confirmed shows its saved
 * invoice lines and the P&L stored on it (ZPL ...); one that has not shows the same figures calculated now and says they are
 * planned. When the calculation cannot run (option / short straddle deals, a missing master, no exchange rate) the saved lines and
 * stored P&L still show, with the reason.
 */

/**
 * The lines as the SAP screen shows them. The confirmation keeps a USD-currency trade at rate 1 with its amount in USD; SAP's
 * Planned Trade Invoices shows it at the linked leg's rate with the amount in the other currency (T1: 10,000,000 USD, 990,000,000,
 * rate 99). For display only, a USD line that was calculated now (not a saved one) is expressed that way, from the linked leg's
 * all-in rate. What the confirmation saves is not changed.
 */
export function sapDisplayLines(lines: readonly PlanLine[], legs: readonly Pick<Leg, 'dealType' | 'rateVal'>[]): PlanLine[] {
  return lines.map((l) => {
    const rate = l.linked ? legs.find((g) => g.dealType === l.linked)?.rateVal ?? 0 : 0
    if (l.reused || l.ZTRD_CURR !== 'USD' || !rate) return l
    return { ...l, ZEX_RATE: rate, ZINV_AMT: Math.round(l.ZAMT * rate * 100) / 100 }
  })
}

/** NDF fixing profit: the cash amount of the NDF leg, when the fixing has produced one. */
function ndfAdjustment(deal: Deal, entity: string | undefined): { entity: string; amount: number } | null {
  const leg = deal.legs.find((l) => l.ndf?.cashAmount != null && l.ndf.cashAmount !== 0)
  return leg && entity ? { entity, amount: leg.ndf!.cashAmount! } : null
}

/** Null when no FX Deal ID has this number. A failed read throws, so a blank is never mistaken for "no figures". */
export async function loadPlanned(dealId: string, signal?: AbortSignal): Promise<PlannedData | null> {
  const loaded = await loadDeal(dealId, signal)
  if (!loaded) return null
  const { deal, row } = loaded
  const stored = deal.storedPl
  const confirmed = deal.confirmed || !!stored
  const calc = deal.noInv ? null : await planDeal(row, deal.legs)

  if (deal.noInv) {
    return { dealId, source: 'none', note: 'This FX model is configured without an invoice plan (ZNO_INV), so no planned trade invoices or P&L are created for it.', invoices: [], pnl: null, stored, rate: null }
  }
  if (calc && calc.ok) {
    const shown = sapDisplayLines(calc.lines, deal.legs)
    const d2 = shown.find((l) => l.linked === 'D2')
    return {
      dealId,
      source: confirmed ? 'stored' : 'planned',
      note: confirmed
        ? 'The deal was confirmed: the invoice lines are the saved ones (ZSGTSFTR_INV_REF) and the P&L is the one stored on the Deal ID.'
        : 'Not yet confirmed by M.O.: calculated now from the FX legs with the same rules as Confirm FX Deal ID. Nothing is saved until it is confirmed.',
      invoices: invoiceRows(shown),
      pnl: pnlGrid(buildPnl(shown, 1), shown.find((l) => l.ZTRD_CURR !== 'USD')?.ZTRD_CURR ?? '', ndfAdjustment(deal, d2?.buyer)),
      stored,
      rate: { value: calc.rate, date: calc.rateDate },
    }
  }
  const saved = storedInvoiceRows(deal.invoices)
  return {
    dealId,
    source: saved.length || stored ? 'stored' : 'none',
    note: calc && !calc.ok ? calc.reason : 'The planned figures could not be calculated.',
    invoices: saved,
    pnl: null,
    stored,
    rate: null,
  }
}
