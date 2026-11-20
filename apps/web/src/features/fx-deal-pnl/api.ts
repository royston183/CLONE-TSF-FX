import { SAMPLE_DEALS } from './sample-deals.ts'
import { dealSummary, entityPnl, plannedCalc, settlementCalc } from './calc.ts'
import type { DealDetail, DealPnl, DealSummary, PlannedCalc, SettlementCalc } from './types.ts'
import { REPORTING_CCY } from './types.ts'

/**
 * Data access for the FX Deal P&L Analysis report. Every call has the shape of the endpoint that will replace it:
 *
 *   getDeals()                  GET /api/fx-pnl/deals
 *   getDealPnl(dealId)          GET /api/fx-pnl/deals/{dealId}/summary
 *   getPlanned(dealId)          GET /api/fx-pnl/deals/{dealId}/planned
 *   getSettlement(dealId)       GET /api/fx-pnl/deals/{dealId}/settlement
 *   getRates()                  GET /api/fx-pnl/rates
 *
 * Until those exist the ten sample deals in sample-deals.ts are served. Connecting the live service means filling `DEALS` from
 * the `DealDetail` the endpoints return and handing it to the same calc.ts functions; nothing else changes.
 */

/** Where the figures come from: sample deals until the P&L service is connected. */
export const DATA_SOURCE = 'sample' as const

/** The deals served. Replace with what the P&L service returns; empty this to show none. */
const DEALS: DealDetail[] = SAMPLE_DEALS

const LATENCY = 350

function later<T>(work: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        resolve(work())
      } catch (error) {
        reject(error)
      }
    }, LATENCY)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

function find(dealId: string): DealDetail {
  const deal = DEALS.find((d) => d.id === dealId)
  if (!deal) throw new Error(`Deal ${dealId} was not found.`)
  return deal
}

export const getDeals = (signal?: AbortSignal): Promise<DealSummary[]> => later(() => DEALS.map(dealSummary), signal)
export const getDealPnl = (dealId: string, signal?: AbortSignal): Promise<DealPnl> => later(() => entityPnl(find(dealId)), signal)
export const getPlanned = (dealId: string, signal?: AbortSignal): Promise<PlannedCalc> => later(() => plannedCalc(find(dealId)), signal)
export const getSettlement = (dealId: string, signal?: AbortSignal): Promise<SettlementCalc> => later(() => settlementCalc(find(dealId)), signal)

/** Counter-currency units per USD used to express other currencies in the reporting currency, by deal. */
export const getRates = (signal?: AbortSignal): Promise<{ reportingCcy: string; rates: { dealId: string; ccy: string; perUsd: number }[] }> =>
  later(() => ({ reportingCcy: REPORTING_CCY, rates: DEALS.map((d) => ({ dealId: d.id, ccy: d.localCcy, perUsd: d.reportingRate })) }), signal)
