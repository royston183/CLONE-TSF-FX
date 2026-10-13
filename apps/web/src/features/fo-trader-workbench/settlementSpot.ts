/*
 * Settlement Spot of the FO Trader Workbench (SUBMIT ZSGTSFR_SPOT_CREATE, FORM create_sett_spot): books the spot that
 * covers an invoice difference saved in ZSGTSFTR_IN_SPOT. ZSGTSFR_SPOT_CREATE is what Additional Spot Booking
 * implements, so this reuses its create unchanged:
 *
 *   FxTransaction POST (SpotRate = ForwardRate = the rate), the spot's TrmFxApp row (TXN_STATUS 03, deal type = the DSS
 *   type, the Deal linkage copied), then ZSPOT_TXN / ZSPOT_CREATE on the IN_SPOT row.
 *
 * The IN_SPOT row is read from SAP (not taken from the workbench's copy, which has no model or key), the spot's company
 * and transaction type come from SET_SPT / COMP / ZGTCATR_PARAM through prepareSpot, and the rate defaults to TCURR (M).
 */
import { txt } from '../../shared/fx/masters.ts'
import { getExchangeRate, type GetExchangeRate } from '../../shared/fx/exchange-rate.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { spotQuotePair, SPOT_RATE_TYPE, pickInSpotRow } from '../mo-execute-settlement-deal-id/api.ts'
import { createAdditionalSpot, defaultTradeDate, prepareSpot, type SpotContext, type SpotPorts } from '../fo-additional-spot-booking/spotCreate.ts'
import { spotPorts } from '../fo-additional-spot-booking/spotPorts.ts'
import { toSpotRow } from '../fo-additional-spot-booking/spotList.ts'
import type { SpotRow } from '../fo-additional-spot-booking/types.ts'

/** The transaction the spot settles: its deal type and key, as the workbench holds them. */
export type SettlementLeg = { dealId: string; dealType: string; rfha: string; bukrs: string }

export type PreparedSettlementSpot = { row: SpotRow; ctx: SpotContext }
export type PrepareResult = { ok: true; value: PreparedSettlementSpot } | { ok: false; reason: string }

const EMPTY_CONTEXT = { companies: new Map<string, string>(), fx: new Map<string, FxRow>() }

/** The open IN_SPOT row of the leg and the spot's derived configuration, or why there is nothing to book. */
export async function prepareSettlementSpot(leg: SettlementLeg, ports: SpotPorts = spotPorts, list: (dealId: string) => Promise<FxRow[]> = (id) => fxList('inSpot', { ZDEAL_ID: id })): Promise<PrepareResult> {
  try {
    const inSpot = await list(leg.dealId)
    const found = pickInSpotRow(inSpot, { dealType: leg.dealType, rfha: leg.rfha })
    if (!found) return { ok: false, reason: 'No Spot to book: ZSGTSFTR_IN_SPOT has no open difference for this deal type. Save the invoice difference on MO: Execute Settlement first.' }
    const row: SpotRow = { ...toSpotRow(found, EMPTY_CONTEXT), companyCode: txt(found, 'ZBUKRS') || leg.bukrs, originalTxn: txt(found, 'ZRFHA') || leg.rfha }
    return { ok: true, value: { row, ctx: await prepareSpot(ports, row) } }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** TCURR (type M, latest on or before today) for the pair the spot is quoted in; null when there is none. */
export async function defaultSpotRate(row: Pick<SpotRow, 'currency'>, ctx: Pick<SpotContext, 'otherCurrency'>, today: Date = new Date(), lookup: GetExchangeRate = getExchangeRate): Promise<number | null> {
  const { from, to } = spotQuotePair(row.currency, ctx.otherCurrency)
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const found = await lookup(from, to, iso, SPOT_RATE_TYPE).catch(() => null)
  return found !== null && found > 0 ? found : null
}

export const defaultTradeOf = (ctx: Pick<SpotContext, 'valueDate'>): Date => defaultTradeDate(ctx.valueDate)

export type SettlementSpotResult = { ok: true; transaction: string; message: string } | { ok: false; message: string }

/** Books the spot. SAP's booking is real once it returns a number, so a failed follow-up write is reported as such, never as "not created". */
export async function bookSettlementSpot(row: SpotRow, input: { partner: string; tradeDate: Date; rate: number }, ports: SpotPorts = spotPorts): Promise<SettlementSpotResult> {
  const out = await createAdditionalSpot(ports, row, input)
  if (out.stage === 'refused') return { ok: false, message: out.messages.join(' ') }
  if (out.persist.appStr === 'done' && out.persist.inSpot === 'done') {
    return { ok: true, transaction: out.created.transaction, message: `Spot Transaction created Successfully: ${out.created.transaction}` }
  }
  const failed = [out.persist.appStr !== 'done' ? `its TSF data: ${out.persist.appStr}` : '', out.persist.inSpot !== 'done' ? `ZSGTSFTR_IN_SPOT: ${out.persist.inSpot}` : ''].filter(Boolean)
  return { ok: true, transaction: out.created.transaction, message: `Spot ${out.created.transaction} was booked in SAP, but saving ${failed.join('; ')}.` }
}
