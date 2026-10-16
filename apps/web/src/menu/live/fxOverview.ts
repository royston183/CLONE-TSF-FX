import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { Kpi, Slice } from '../mock/overview.ts'

/**
 * The FX Overview, read from the SLC middleware (the SAP tables behind the FX screens):
 *
 *   tsfvFx         ZSGTSFV_FX      the FX deals (spot / forward / NDF): amounts, rates, dates, company
 *   masterContract ZSGTSFTR_MAS_CON  master contracts (status, USD amount, commodity, FX model, shipment dates)
 *   tsfDealId      ZSGTSFTR_DEALID   Deal IDs (status, model, amount, P&L)
 *   billOfLading   ZSGTSFTR_BL       bills of lading (trade value, business unit, status)
 *   billAdjustment ZSGTSFTR_BIL_ADJ  trade invoices
 *   inSpot         ZSGTSFTR_IN_SPOT  the spot hedges the Deal IDs plan
 *   + the status and model texts (tsfDealStatus, mcStatus, blStatus, fxModel)
 *
 * Every source loads on its own, so one that fails leaves its figures out and says so instead of blanking the page.
 * Everything below `loadFxOverviewRaw` is pure, so the company filter re-computes without another read.
 */

export type FxOverviewRaw = {
  fxDeals: FxRow[] | null
  mcs: FxRow[] | null
  dealIds: FxRow[] | null
  bls: FxRow[] | null
  invoices: FxRow[] | null
  spots: FxRow[] | null
  dealStatuses: FxRow[]
  mcStatuses: FxRow[]
  blStatuses: FxRow[]
  models: FxRow[]
  problems: string[]
  loadedAt: Date
}

export type SeriesKey = 'deals' | 'contracts' | 'dealIds' | 'invoices'
export const SERIES_LABEL: Record<SeriesKey, string> = {
  deals: 'FX deals',
  contracts: 'Master contracts',
  dealIds: 'Deal IDs',
  invoices: 'Invoices',
}

export type TableRow = { cells: string[] }

export type FxOverview = {
  kpis: Kpi[]
  products: Slice[]
  exposureByCompany: Slice[]
  maturity: Slice[]
  mcStatus: Slice[]
  mcByCommodity: Slice[]
  mcByModel: Slice[]
  invoicesByCommodity: Slice[]
  dealIdStatus: Slice[]
  dealIdByModel: Slice[]
  blByUnit: Slice[]
  blStatus: Slice[]
  spotByType: Slice[]
  /** ISO day -> records created that day, per series: the activity chart windows it. */
  daily: Record<SeriesKey, Record<string, number>>
  upcoming: TableRow[]
  recentContracts: TableRow[]
  companies: string[]
}

const ENDPOINTS = [
  ['fxDeals', 'tsfvFx', 'FX deals (ZSGTSFV_FX)'],
  ['mcs', 'masterContract', 'master contracts (ZSGTSFTR_MAS_CON)'],
  ['dealIds', 'tsfDealId', 'Deal IDs (ZSGTSFTR_DEALID)'],
  ['bls', 'billOfLading', 'bills of lading (ZSGTSFTR_BL)'],
  ['invoices', 'billAdjustment', 'trade invoices (ZSGTSFTR_BIL_ADJ)'],
  ['spots', 'inSpot', 'spot hedges (ZSGTSFTR_IN_SPOT)'],
] as const

const TEXT_SOURCES = [
  ['dealStatuses', 'tsfDealStatus', { ZDEAL_TYPE: 'FX' }],
  ['mcStatuses', 'mcStatus', {}],
  ['blStatuses', 'blStatus', {}],
  ['models', 'fxModel', {}],
] as const

export async function loadFxOverviewRaw(signal?: AbortSignal): Promise<FxOverviewRaw> {
  const data = await Promise.allSettled(ENDPOINTS.map(([, resource]) => fxList(resource, {}, { signal })))
  const texts = await Promise.allSettled(TEXT_SOURCES.map(([, resource, filter]) => fxList(resource, { ...filter }, { signal })))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const raw: Record<string, FxRow[] | null> = {}
  const problems: string[] = []
  ENDPOINTS.forEach(([key, , label], i) => {
    const r = data[i]
    raw[key] = r?.status === 'fulfilled' ? r.value : null
    if (r?.status === 'rejected') problems.push(`${label} — ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
  })
  TEXT_SOURCES.forEach(([key], i) => {
    const r = texts[i]
    raw[key] = r?.status === 'fulfilled' ? r.value : []
  })
  return { ...(raw as Omit<FxOverviewRaw, 'problems' | 'loadedAt'>), problems, loadedAt: new Date() }
}

// ------------------------------------------------------------------ pure part

const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthOf = (iso: string | null | undefined) => (iso ?? '').slice(0, 7)
const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('-') : '')

/** The last `days` days ending today as ISO strings, oldest first. */
export function lastDays(today: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i))))
}

/** Compact currency for chart values: 1.2bn / 3.4m / 56k / 789. */
export function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}bn`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}m`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return String(Math.round(value))
}
export const usd = (value: number) => `USD ${compact(value)}`

const change = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / before) * 100)

function tally<T>(rows: readonly T[], key: (r: T) => string, weight: (r: T) => number = () => 1): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + weight(r))
  return out
}

/** The biggest `max` slices; the rest are folded into one "Other". */
export function top(slices: Slice[], max: number): Slice[] {
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= max) return sorted
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0)
  return [...sorted.slice(0, max - 1), { label: 'Other', value: rest }]
}

const slices = (m: Map<string, number>, label: (k: string) => string): Slice[] =>
  [...m].map(([k, value]) => ({ label: label(k), value }))

const PRODUCT: Record<string, string> = { '12A': 'Spot', '12B': 'Forward', '12D': 'NDF' }
const SPOT_TYPE: Record<string, string> = { D1: 'D1 · Forward', D2: 'D2 · NDF', DS1: 'DS1 · Spot (buy)', DS2: 'DS2 · Spot (sell)' }

/** An FX deal that has not been reversed (SAKTIV 3 = reversed). */
const isLive = (r: FxRow) => txt(r, 'SAKTIV') !== '3'

export function buildFxOverview(raw: FxOverviewRaw, company: string, today: Date): FxOverview {
  const todayIso = isoOf(today)
  const thisMonth = monthOf(todayIso)
  const prevMonth = monthOf(isoOf(new Date(today.getFullYear(), today.getMonth() - 1, 1)))

  const allDeals = (raw.fxDeals ?? []).filter(isLive)
  const companies = [...new Set(allDeals.map((r) => txt(r, 'ZCOM_ID')).filter(Boolean))].sort()
  const deals = company === 'All' ? allDeals : allDeals.filter((r) => txt(r, 'ZCOM_ID') === company)
  const open = deals.filter((r) => txt(r, 'DELFZ') >= todayIso)
  const notional = (r: FxRow) => Math.abs(num(r['AMT1']))

  // ---- FX deals
  const openNotional = open.reduce((s, r) => s + notional(r), 0)
  const dealsNow = deals.filter((r) => monthOf(txt(r, 'DCRDAT')) === thisMonth).length
  const dealsBefore = deals.filter((r) => monthOf(txt(r, 'DCRDAT')) === prevMonth).length
  const in30 = open.filter((r) => txt(r, 'DELFZ') <= isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)))
  const ndf = deals.filter((r) => txt(r, 'SGSART') === '12D')
  const ndfDue = ndf.filter((r) => txt(r, 'NDF_DATE') && txt(r, 'NDF_DATE') <= todayIso).length
  const inrRates = deals.filter((r) => txt(r, 'CURR2') === 'INR').map((r) => num(r['T_RATE'])).filter((v) => v > 0)
  const avgRate = inrRates.length ? inrRates.reduce((s, v) => s + v, 0) / inrRates.length : 0

  const products = slices(tally(deals, (r) => txt(r, 'SGSART')), (k) => PRODUCT[k] ?? k)
  const exposureByCompany = top(slices(tally(open, (r) => txt(r, 'ZCOM_ID') || '—', notional), (k) => k), 6)
  const ladder = [
    { label: 'Within 7 days', from: 0, to: 7 },
    { label: '8 – 30 days', from: 8, to: 30 },
    { label: '31 – 90 days', from: 31, to: 90 },
    { label: 'Over 90 days', from: 91, to: Infinity },
  ]
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const maturity = ladder.map((b) => ({
    label: b.label,
    value: open.reduce((s, r) => {
      const days = Math.round((new Date(`${txt(r, 'DELFZ')}T00:00:00`).getTime() - start) / 86_400_000)
      return days >= b.from && days <= b.to ? s + notional(r) : s
    }, 0),
  }))

  // ---- master contracts
  const mcs = raw.mcs ?? []
  const mcStatusText = (code: string) => txt(raw.mcStatuses.find((s) => txt(s, 'ZMC_ID') === code) ?? {}, 'ZMC_STAT') || code
  const mcSum = mcs.reduce((s, r) => s + num(r['ZAMT']), 0)
  const mcNow = mcs.filter((r) => monthOf(txt(r, 'ZMC_DATE')) === thisMonth).length
  const mcBefore = mcs.filter((r) => monthOf(txt(r, 'ZMC_DATE')) === prevMonth).length
  const mcInUse = mcs.filter((r) => txt(r, 'ZMC_STAT') === '04').length

  // ---- Deal IDs
  const dealIds = raw.dealIds ?? []
  const dealStatusText = (code: string) => txt(raw.dealStatuses.find((s) => txt(s, 'ZDEAL_STAT') === code) ?? {}, 'ZDEAL_SDESC') || code
  const modelText = (id: string) => txt(raw.models.find((m) => txt(m, 'ZMOD_ID') === id) ?? {}, 'ZMOD_DESC') || id
  const liveDealIds = dealIds.filter((r) => txt(r, 'ZDEAL_STAT') !== '30')
  const dealIdsNow = dealIds.filter((r) => monthOf(txt(r, 'ZCREATED_DATE')) === thisMonth).length
  const dealIdsBefore = dealIds.filter((r) => monthOf(txt(r, 'ZCREATED_DATE')) === prevMonth).length

  // ---- trade flows and invoices
  const bls = raw.bls ?? []
  const blValue = bls.reduce((s, r) => s + num(r['ZTTV']), 0)
  const invoices = raw.invoices ?? []
  const invNow = invoices.filter((r) => monthOf(txt(r, 'ZCREATED_DATE')) === thisMonth).length
  const invBefore = invoices.filter((r) => monthOf(txt(r, 'ZCREATED_DATE')) === prevMonth).length
  const invValue = invoices.filter((r) => txt(r, 'ZPC') === 'C').reduce((s, r) => s + num(r['ZAMT_USD']), 0)

  const daily = (rows: readonly FxRow[], column: string): Record<string, number> => Object.fromEntries(tally(rows, (r) => txt(r, column)))
  const series = (rows: readonly FxRow[] | null, col: string) => (rows ? rows.map((r) => txt(r, col)) : [])
  const spark = (isos: readonly string[], n = 8) => lastDays(today, n * 4).reduce<number[]>((acc, d, i) => {
    const b = Math.floor(i / 4)
    acc[b] = (acc[b] ?? 0) + isos.filter((x) => x === d).length
    return acc
  }, [])

  const kpi = (label: string, value: string, delta: number | null, deltaNote: string, s: number[]): Kpi => ({ label, value, delta, deltaNote, series: s })
  const have = (rows: unknown) => rows !== null
  const kpis: Kpi[] = [
    kpi('FX Deals', have(raw.fxDeals) ? deals.length.toLocaleString() : '—', change(dealsNow, dealsBefore), 'booked vs last month', spark(series(deals, 'DCRDAT'))),
    kpi('Open USD Notional', have(raw.fxDeals) ? usd(openNotional) : '—', null, `${open.length} deals not yet matured`, spark(series(open, 'DCRDAT'))),
    kpi('Maturing in 30 Days', have(raw.fxDeals) ? in30.length.toLocaleString() : '—', null, usd(in30.reduce((s, r) => s + notional(r), 0)), spark(series(in30, 'DCRDAT'))),
    kpi('Master Contract Value', have(raw.mcs) ? usd(mcSum) : '—', null, `${mcInUse} in use`, spark(series(mcs, 'ZMC_DATE'))),
    kpi('Trade Flow Value', have(raw.bls) ? usd(blValue) : '—', null, `${bls.length} bills of lading`, spark(series(bls, 'ZCREATED_DATE'))),
  ]

  const upcoming = [...open]
    .sort((a, b) => txt(a, 'DELFZ').localeCompare(txt(b, 'DELFZ')))
    .slice(0, 8)
    .map((r) => ({
      cells: [
        dmy(txt(r, 'DELFZ')),
        txt(r, 'ZCOM_ID'),
        PRODUCT[txt(r, 'SGSART')] ?? txt(r, 'SGSART'),
        `${txt(r, 'CURR1')}/${txt(r, 'CURR2')} ${txt(r, 'BS_1')}`,
        `USD ${notional(r).toLocaleString()}`,
        num(r['T_RATE']).toFixed(4),
      ],
    }))

  const recentContracts = [...mcs]
    .sort((a, b) => txt(b, 'ZMC_REF_NO').localeCompare(txt(a, 'ZMC_REF_NO')))
    .slice(0, 8)
    .map((r) => ({
      cells: [
        txt(r, 'ZMC_REF_NO'),
        txt(r, 'ZCOM_DESC'),
        `USD ${num(r['ZAMT']).toLocaleString()}`,
        dmy(txt(r, 'ZSHIP_END')),
        mcStatusText(txt(r, 'ZMC_STAT')),
      ],
    }))

  return {
    kpis,
    products,
    exposureByCompany,
    maturity,
    mcStatus: top(slices(tally(mcs, (r) => txt(r, 'ZMC_STAT')), mcStatusText), 6),
    mcByCommodity: top(slices(tally(mcs, (r) => txt(r, 'ZCOM_DESC') || '—'), (k) => k), 6),
    mcByModel: top(slices(tally(mcs, (r) => txt(r, 'ZMOD_DESC') || txt(r, 'ZMOD_ID') || '—'), (k) => k), 6),
    invoicesByCommodity: top(
      slices(tally(invoices, (r) => txt(r, 'ZINV_COMM').toLowerCase() || '—'), (k) => (k === '—' ? k : k.charAt(0).toUpperCase() + k.slice(1))),
      6,
    ),
    dealIdStatus: top(slices(tally(dealIds, (r) => txt(r, 'ZDEAL_STAT')), dealStatusText), 5),
    dealIdByModel: top(slices(tally(dealIds, (r) => txt(r, 'ZTSF_MODEL') || '—'), modelText), 6),
    blByUnit: top(slices(tally(bls, (r) => txt(r, 'ZBU') || '—', (r) => num(r['ZTTV'])), (k) => k), 6),
    blStatus: top(
      slices(tally(bls, (r) => txt(r, 'ZBL_STAT_ID')), (k) => txt(raw.blStatuses.find((s) => txt(s, 'ZBL_ST_ID') === k) ?? {}, 'ZBL_ST_NAME') || k),
      5,
    ),
    spotByType: slices(tally(raw.spots ?? [], (r) => txt(r, 'ZDEAL_TYPE')), (k) => SPOT_TYPE[k] ?? k).sort((a, b) => b.value - a.value),
    daily: {
      deals: daily(deals, 'DCRDAT'),
      contracts: daily(mcs, 'ZMC_DATE'),
      dealIds: daily(dealIds, 'ZCREATED_DATE'),
      invoices: daily(invoices, 'ZCREATED_DATE'),
    },
    upcoming,
    recentContracts,
    companies,
  }
}
