import { loadExchangeRate } from './exchange-rate-api.ts'
import type { FxRow } from './mw.ts'
import { num } from './sap.ts'

/**
 * Exchange rates from TCURR, read through SAP's ExchangeRate OData service. This stands in for
 * BAPI_EXCHANGERATE_GETDETAIL, which is not wired: it is the same table, read for one rate type and
 * date. The rate is the latest row dated on or before the requested day.
 *
 * The service exposes ordinary effective dates, ordered newest first.
 * A negative ExchangeRate is SAP's indirect quotation: the rate is 1 / |ExchangeRate|.
 */
export const invertedDate = (iso: string): string => String(99999999 - Number(iso.replace(/-/g, '')))

/** `from -> to` on `date` (YYYY-MM-DD): a lookup that answers null when there is no usable rate. */
export type GetExchangeRate = (from: string, to: string, date: string, rateType: string, signal?: AbortSignal) => Promise<number | null>

export const rateOfRow = (row: FxRow): number => {
  const u = num(row['UKURS'])
  return u < 0 ? 1 / Math.abs(u) : u
}

async function direct(from: string, to: string, date: string, rateType: string, signal?: AbortSignal): Promise<number | null> {
  const row = await loadExchangeRate(from, to, date, rateType, signal)
  const rate = row ? rateOfRow({ UKURS: String(row.ExchangeRate) }) : 0
  return rate > 0 && row?.SourceCurrency ? rate : null
}

/** TCURR: the pair as asked, else its inverse (1 / rate). Same currency is 1. */
export const getExchangeRate: GetExchangeRate = async (from, to, date, rateType, signal) => {
  if (!from || !to) return null
  if (from === to) return 1
  const rate = await direct(from, to, date, rateType, signal)
  if (rate !== null) return rate
  const inverse = await direct(to, from, date, rateType, signal)
  return inverse === null ? null : 1 / inverse
}
