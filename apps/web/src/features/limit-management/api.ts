import { apiFetch, list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { regionText } from '../../shared/fx/deal-id.ts'
import { normalisePair, splitDeal } from './logic.ts'
import type { LimitDeal, RawLimit } from './types.ts'

/*
 * Limit Management data layer.
 *
 * LIMITS and CURRENCY PAIRS live in the gateway's local SQLite database (migrations 011 / 012), spoken in SAP's field names:
 *   ZSGTSFTR_LIM_MAN   /api/localdb/tsf-limit            ZYEAR, ZCURR_PAIR, ZLIMIT_STARTDT, ZLIMIT_MATDT (key), ZCURR, ZINI_AAMT,
 *                                                        ZAD_AAMT, ZUNAPROV_AMT, ZUTL_AMT, ZLIM_SET / _APP / _REJ / _ADDLIM
 *   ZSGTRMTR_CURPAIR   /api/localdb/tsf-currency-pair    F_CURR, T_CURR, PAIR (pairs where one leg is USD)
 * ZUTL_AMT is the utilised amount the program shows; this screen never recalculates it.
 *
 * DEALS (the bank-wise summary and its Deal ID list) are read as the Deal ID screens read them: ZSGTSFTR_DEALID (middleware
 * 'tsfDealId', D1 slot ZRFHA1 / ZBUKRS1), its transaction in ZSGTSFV_FX ('tsfvFx'), the Master Contract ('masterContract'), the
 * status texts ('tsfDealStatus') and the origin company's region ('comp').
 */
const limitApi = service('localdb')('tsf-limit')
const pairApi = service('localdb')('tsf-currency-pair')
const exchangeApi = service('exchangerate')

export type Loaded<T> = { rows: T[]; unavailable: string | null }

const failure = (what: string, error: unknown) => `${what}: ${error instanceof Error ? error.message : String(error)}`
/** SAP DATS (YYYYMMDD) -> ISO, for the screen's date handling. */
const isoOf = (dats: string): string => (/^d{8}$/.test(dats) ? `${dats.slice(0, 4)}-${dats.slice(4, 6)}-${dats.slice(6, 8)}` : dats.slice(0, 10))
const datsOf = (iso: string): string => iso.replace(/-/g, '')

type LimitRow = Record<string, string | number | null | undefined>
const str = (row: LimitRow, column: string): string => String(row[column] ?? '').trim()

export function toRawLimit(row: LimitRow): RawLimit {
  const startDt = isoOf(str(row, 'ZLIMIT_STARTDT'))
  const endDt = isoOf(str(row, 'ZLIMIT_MATDT'))
  const pair = normalisePair(str(row, 'ZCURR_PAIR'))
  return {
    id: [pair, startDt, endDt].join('|'),
    pair,
    year: Number(str(row, 'ZYEAR')) || Number(startDt.slice(0, 4)) || 0,
    startDt,
    endDt,
    curr: str(row, 'ZCURR') || 'USD',
    zini: num(row['ZINI_AAMT']),
    zad: num(row['ZAD_AAMT']),
    zunaprov: num(row['ZUNAPROV_AMT']),
    utl: num(row['ZUTL_AMT']),
    app: str(row, 'ZLIM_APP') === 'X',
    rej: str(row, 'ZLIM_REJ') === 'X',
    addlim: str(row, 'ZLIM_ADDLIM') === 'X',
  }
}

/** All limits of ZSGTSFTR_LIM_MAN. */
export async function loadLimits(signal?: AbortSignal): Promise<Loaded<RawLimit>> {
  try {
    const body = await apiFetch<{ value?: LimitRow[] }>(limitApi, signal ? { signal } : undefined)
    return { rows: (body?.value ?? []).map(toRawLimit), unavailable: null }
  } catch (error) {
    if (isAbort(error)) throw error
    return { rows: [], unavailable: failure('The limits (ZSGTSFTR_LIM_MAN) could not be read', error) }
  }
}

/** The rate type the program reads (TCURR-KURST 'M', get_exch_rate). */
const RATE_TYPE = 'M'

/** Pairs with a USD leg from the SAP exchange-rate service (TCURR), in the direction SAP holds them. */
async function pairsFromExchangeRates(signal?: AbortSignal): Promise<string[]> {
  const found = new Set<string>()
  for (const side of ['SourceCurrency', 'TargetCurrency'] as const) {
    const rows = await list<{ SourceCurrency?: string; TargetCurrency?: string }>(
      exchangeApi('ExchangeRate'),
      {
        filter: `RateType eq ${odataString(RATE_TYPE)} and ${side} eq 'USD'`,
        select: ['SourceCurrency', 'TargetCurrency'],
        orderby: 'ExchangeRateEffectiveDate desc',
        top: 500,
      },
      signal ? { signal } : undefined,
    )
    for (const r of rows) {
      const pair = normalisePair(`${r.SourceCurrency ?? ''}-${r.TargetCurrency ?? ''}`)
      if (/^[A-Z]{3}-[A-Z]{3}$/.test(pair) && pair.slice(0, 3) !== pair.slice(4)) found.add(pair)
    }
  }
  return [...found].sort()
}

export type PairList = { pairs: string[]; /** Set when the list is not ZSGTRMTR_CURPAIR itself. */ note: string | null }

/**
 * Currency pairs with a USD leg. ZSGTRMTR_CURPAIR (local SQLite table: F_CURR, T_CURR, PAIR) is the program's own list; none of the
 * configured OData services exposes that table, so while it is empty the pairs come from the SAP exchange rates (ExchangeRate
 * service, TCURR type M): real SAP pairs, but every pair that has a rate, not only the ones set up for trading.
 */
export async function loadCurrencyPairs(signal?: AbortSignal): Promise<PairList> {
  let table: string[] = []
  try {
    const body = await apiFetch<{ value?: LimitRow[] }>(pairApi, signal ? { signal } : undefined)
    table = [
      ...new Set(
        (body?.value ?? [])
          .filter((r) => str(r, 'F_CURR') === 'USD' || str(r, 'T_CURR') === 'USD')
          .map((r) => normalisePair(str(r, 'PAIR') || `${str(r, 'F_CURR')}-${str(r, 'T_CURR')}`))
          .filter(Boolean),
      ),
    ].sort()
  } catch (error) {
    if (isAbort(error)) throw error
  }
  if (table.length) return { pairs: table, note: null }
  try {
    const pairs = await pairsFromExchangeRates(signal)
    if (pairs.length) return { pairs, note: 'ZSGTRMTR_CURPAIR has no rows here, so the currency pairs are the USD pairs that have SAP exchange rates (TCURR, rate type M).' }
  } catch (error) {
    if (isAbort(error)) throw error
  }
  return { pairs: [], note: 'No currency pairs could be read (ZSGTRMTR_CURPAIR is empty and the SAP exchange-rate service did not answer).' }
}

const stripZeros = (v: string) => v.replace(/^0+/, '')

/** D1 deals of every Deal ID (cancelled ones excluded, as the ABAP's utilisation reads them). */
export async function loadDeals(signal?: AbortSignal): Promise<Loaded<LimitDeal>> {
  try {
    const [deals, mcs, comps, statuses] = await Promise.all(
      (['tsfDealId', 'masterContract', 'comp', 'tsfDealStatus'] as const).map((r) => fxList(r, {}, { signal })),
    )
    const view = await fxList('tsfvFx', {}, { signal })
    const legs = new Map(view.map((r) => [`${txt(r, 'BUKRS')}|${stripZeros(txt(r, 'RFHA'))}`, r]))
    const mcByRef = new Map((mcs ?? []).map((m) => [txt(m, 'ZMC_REF_NO'), m]))
    const out: LimitDeal[] = []
    for (const d of deals ?? []) {
      if (txt(d, 'ZDEAL_STAT') === '30' || !txt(d, 'ZRFHA1')) continue
      const leg = legs.get(`${txt(d, 'ZBUKRS1')}|${stripZeros(txt(d, 'ZRFHA1'))}`)
      if (!leg) continue
      const mc = mcByRef.get(txt(d, 'ZMC_REF'))
      const comp = mc ? (comps ?? []).find((c) => txt(c, 'ZCOM_ID') === txt(mc, 'ZORIGIN')) : undefined
      const status = (statuses ?? []).find((s) => txt(s, 'ZDEAL_TYPE') === txt(d, 'ZDEAL_TYPE') && txt(s, 'ZSUB_TYPE') === txt(d, 'ZSUB_TYPE') && txt(s, 'ZDEAL_STAT') === txt(d, 'ZDEAL_STAT'))
      const pair = normalisePair(txt(leg, 'CPAIR') || `${txt(leg, 'F_CURR1')}-${txt(leg, 'T_CURR1')}`)
      const base = {
        pair,
        bs1: /^b/i.test(txt(leg, 'BS_1')) ? 'Buy' : 'Sell',
        curr1: txt(leg, 'CURR1'),
        amt1: num(leg['AMT1']),
        curr2: txt(leg, 'CURR2'),
        amt2: num(leg['AMT2']),
      }
      out.push({
        dealId: txt(d, 'ZDEAL_ID'),
        desc: txt(d, 'ZDEAL_DESC'),
        bpNo: txt(leg, 'KONTRH'),
        bpName: txt(leg, 'BP_NAME') || txt(leg, 'KONTRH'),
        model: txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : ''),
        dealType: 'D1',
        rate: num(leg['OTOT_RATE']),
        tradeDate: txt(leg, 'DBLFZ').slice(0, 10),
        valueDate: txt(leg, 'DELFZ').slice(0, 10),
        startDate: txt(d, 'ZS_DATE').slice(0, 10),
        endDate: txt(d, 'ZE_DATE').slice(0, 10),
        mcRef: txt(d, 'ZMC_REF'),
        mcDate: mc ? txt(mc, 'ZMC_DATE').slice(0, 10) : '',
        mcAmt: mc ? num(mc['ZAMT']) : 0,
        region: comp ? regionText(txt(comp, 'ZREG_ID')) : '',
        statusDesc: (status ? txt(status, 'ZDEAL_SDESC') : '') || txt(d, 'ZDEAL_STAT'),
        txnNo: txt(leg, 'RFHA'),
        ...base,
        ...splitDeal(base),
      })
    }
    return { rows: out, unavailable: null }
  } catch (error) {
    if (isAbort(error)) throw error
    return { rows: [], unavailable: `The Deal IDs behind the utilisation could not be read: ${error instanceof Error ? error.message : String(error)}` }
  }
}

const limitUrl = (pair: string, startDt: string, endDt: string, year: number) =>
  `${limitApi}/${year}/${encodeURIComponent(pair)}/${datsOf(startDt)}/${datsOf(endDt)}`

const put = (url: string, body: Record<string, unknown>) => apiFetch(url, { method: 'PUT', body })

/** Set Initial Limit (SET_LIMIT): a new row with ZUNAPROV_AMT = the amount and ZLIM_SET = X, waiting for approval. */
export async function createInitialLimit(p: { pair: string; startDt: string; endDt: string; year: number; curr: string; amount: number }): Promise<void> {
  await put(limitUrl(p.pair, p.startDt, p.endDt, p.year), { ZCURR: p.curr, ZUNAPROV_AMT: p.amount, ZLIM_SET: 'X' })
}

/** Set Additional Limit (SET_ADLIMIT): ZUNAPROV_AMT += amount, ZLIM_ADDLIM = X, ZLIM_APP cleared. */
export async function createAdditionalLimit(raw: RawLimit, amount: number): Promise<void> {
  await put(limitUrl(raw.pair, raw.startDt, raw.endDt, raw.year), { ZUNAPROV_AMT: raw.zunaprov + amount, ZLIM_ADDLIM: 'X', ZLIM_APP: '' })
}
