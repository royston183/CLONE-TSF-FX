/**
 * View Deal ID, "FX Deals" grid (ZSGTSF_RVIEW_DEAL reads ZSGTSFCDS_FX WHERE ztsf_deal_id = deal): the
 * transactions whose TrmFxApp row (ZSGTSFTR_APP_STR) carries the Deal ID, each with its standard
 * FxTransaction. Read only. Still WAITING FOR API: option legs (ZSGTSFCDS_OPTION: strike, premium), the
 * entity text (company master) and the invoice / BL / settlement / P&L blocks.
 */
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { loadFxWithApp, allOf, type FxWithApp } from '../../shared/fx/app-str.ts'
import { odataString } from '@slc/api-client'
import type { FxRow } from './types.ts'

export const WAITING_FX_LEGS_OPTION =
  'WAITING FOR API — option legs (ZSGTSFCDS_OPTION: strike, premium) and the entity text are not served; forward / swap legs only'

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** A transaction as one FX Deals row; a sold currency carries a negative amount (lead currency = leg 1). */
export function toFxRow({ fx, app }: FxWithApp): FxRow {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const leadAmt = n(buysLead ? fx.BuyAmount : fx.SellAmount)
  const followAmt = n(buysLead ? fx.SellAmount : fx.BuyAmount)
  const rate = (v: unknown): number | '' => (v === undefined || v === null || v === '' ? '' : n(v))
  return {
    bukrs: fx.CompanyCode,
    dealType: app.ZtsfDealType ?? '',
    rfha: fx.FinancialTransaction,
    start: fx.ContractDate ? dmyFromIso(fx.ContractDate) : '',
    end: fx.ValueDate ? dmyFromIso(fx.ValueDate) : '',
    text: fx.TransactionType,
    entity: '',
    side1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? leadAmt : -leadAmt,
    side2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: buysLead ? -followAmt : followAmt,
    spot: rate(fx.SpotRate),
    swap: rate(fx.SwapRate),
    allIn: rate(fx.ForwardRate),
    strike: '',
    mcRef: app.ZtsfMcRefNo ?? '',
    txnStatus: app.TxnStatus ?? '',
    premium: '',
    premiumCurr: '',
  }
}

/** The Deal ID's FX legs, in transaction order; a reversed transaction (ActiveStatus 3) is not a leg. */
export async function loadDealFxRows(dealId: string, signal?: AbortSignal): Promise<FxRow[]> {
  const rows = await loadFxWithApp(allOf(`ZtsfDealID eq ${odataString(dealId)}`), signal)
  return rows.filter((r) => r.fx.ActiveStatus !== '3').map(toFxRow)
}
