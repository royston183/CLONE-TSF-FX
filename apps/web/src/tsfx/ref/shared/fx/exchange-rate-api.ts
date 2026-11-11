import { list, odataString, service } from '@tsfx/ref/api-client'
import type { FxRow } from './mw.ts'

const api = service('exchangerate')

/** Properties declared by ZFS_SD_EXCHANGERATE's ExchangeRate entity. */
export type ExchangeRate = {
  RateType: string
  SourceCurrency: string
  TargetCurrency: string
  ExchangeRateEffectiveDate: string
  ExchangeRate: string | number
  NumberOfSourceCurrencyUnits: string | number
  NumberOfTargetCurrencyUnits: string | number
}

/** Latest rate on or before the day, or the exact day for NDF's RBI fixing default. */
export async function loadExchangeRate(
  from: string, to: string, date: string, rateType: string, signal?: AbortSignal, exactDate = false,
): Promise<ExchangeRate | null> {
  const rows = await list<ExchangeRate>(api('ExchangeRate'), {
    filter: `RateType eq ${odataString(rateType)} and SourceCurrency eq ${odataString(from)} and TargetCurrency eq ${odataString(to)} and ExchangeRateEffectiveDate ${exactDate ? 'eq' : 'le'} ${date}`,
    orderby: 'ExchangeRateEffectiveDate desc',
    top: 1,
  }, signal ? { signal } : undefined)
  return rows[0] ?? null
}

/** TCURF factors from the rate service; newest effective row first for each pair. */
export async function loadExchangeRateFactors(rateType: string, signal?: AbortSignal): Promise<FxRow[]> {
  const rows: FxRow[] = []
  const pageSize = 500
  for (let skip = 0; ; skip += pageSize) {
    const page = await list<ExchangeRate>(api('ExchangeRate'), {
      filter: `RateType eq ${odataString(rateType)}`,
      orderby: 'SourceCurrency,TargetCurrency,ExchangeRateEffectiveDate desc',
      top: pageSize,
      skip,
    }, signal ? { signal } : undefined)
    rows.push(...page.map((row) => ({
      KURST: row.RateType,
      FCURR: row.SourceCurrency,
      TCURR: row.TargetCurrency,
      FFACT: String(row.NumberOfSourceCurrencyUnits),
      TFACT: String(row.NumberOfTargetCurrencyUnits),
    })))
    if (page.length < pageSize) return rows
  }
}
