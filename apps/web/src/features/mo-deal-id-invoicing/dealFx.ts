/**
 * The D1 / D2 FX legs of a Deal ID (ZSGTSFCDS_FX_N WHERE ztsf_deal_id / ztsf_deal_type): the TrmFxApp rows
 * (ZSGTSFTR_APP_STR) carrying the Deal ID with Deal Type D1 or D2, each with its standard FxTransaction
 * (shared/fx/app-str.ts). Read only. Option legs (ZSGTSFCDS_OPTION_N) and the partner name have no service.
 */
import { odataString } from '@slc/api-client'
import { allOf, loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { loadNdfViews, ndfExtras, ndfKey, viewsByKey } from '../../shared/fx/ndf-columns.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxLeg } from './types.ts'

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export const LEG_TYPES = ['D1', 'D2'] as const

/** `ZtsfDealID ne '' and (ZtsfDealType eq 'D1' or ZtsfDealType eq 'D2')`. */
export const FX_LEG_FILTER = allOf("ZtsfDealID ne ''", LEG_TYPES.map((t) => `ZtsfDealType eq ${odataString(t)}`).join(' or '))

/** A D1 / D2 transaction as a leg: leg 1 is the lead currency, a sold currency carries a negative amount. */
export function toFxLeg({ fx, app }: FxWithApp, view?: FxRow): FxLeg | null {
  const type = app.ZtsfDealType
  if (type !== 'D1' && type !== 'D2') return null
  if (fx.ActiveStatus === '3') return null
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const leadAmt = n(buysLead ? fx.BuyAmount : fx.SellAmount)
  const followAmt = n(buysLead ? fx.SellAmount : fx.BuyAmount)
  return {
    type,
    bukrs: fx.CompanyCode,
    rfha: fx.FinancialTransaction,
    curr1: lead,
    curr2: follow,
    amt1: buysLead ? leadAmt : -leadAmt,
    amt2: buysLead ? -followAmt : followAmt,
    bp: fx.Partner,
    bpName: '',
    rate: n(fx.ForwardRate),
    ndf: ndfExtras(fx, app, view),
  }
}

/** The legs by Deal ID, D1 before D2; if a Deal ID carries several of a type, the first transaction number wins. */
export function legsByDeal(rows: readonly FxWithApp[], views: readonly FxRow[] = []): Map<string, FxLeg[]> {
  const out = new Map<string, FxLeg[]>()
  const viewBy = viewsByKey(views)
  for (const r of [...rows].sort((a, b) => (a.fx.FinancialTransaction < b.fx.FinancialTransaction ? -1 : 1))) {
    const id = r.app.ZtsfDealID ?? ''
    const leg = toFxLeg(r, viewBy.get(ndfKey(r.fx.CompanyCode, r.fx.FinancialTransaction)))
    if (!id || !leg) continue
    const have = out.get(id) ?? []
    if (!have.some((l) => l.type === leg.type)) out.set(id, [...have, leg].sort((a, b) => (a.type < b.type ? -1 : 1)))
  }
  return out
}

export async function loadFxLegsByDeal(signal?: AbortSignal): Promise<Map<string, FxLeg[]>> {
  const rows = await loadFxWithApp(FX_LEG_FILTER, signal)
  return legsByDeal(rows, await loadNdfViews(rows.map((r) => r.fx), signal))
}
