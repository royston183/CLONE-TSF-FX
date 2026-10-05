import {
  COMMODITIES,
  DEAL_SEED,
  DEAL_STATUSES,
  DEFAULT_CO_AREA,
  ENTITIES,
  FX_MODELS,
  MC_SEED,
  PARTNER_BANKS,
  REGIONS,
} from './data.ts'
import { addDays, parseDate } from './format.ts'
import type {
  Deal,
  DealSeed,
  Entity,
  Filters,
  InvoiceLeg,
  KpiFilter,
  Kpis,
  MasterContract,
  McSeed,
  PagerItem,
  Region,
  Sort,
  SortKey,
} from './types.ts'

/* ---------- reference lookups ---------- */

export const entityOf = (code: string): Entity | undefined => ENTITIES.find((e) => e.code === code)
export const regionOf = (id: string): Region | undefined => REGIONS.find((r) => r.id === id)
/** The region's name, or the raw id when the region is unknown. */
export const regionName = (id: string): string => regionOf(id)?.name ?? id

/** Status 21 (Ready for Settlement) and 22 (Settled) are the settled-side statuses. */
export const statusIsSettled = (code: string): boolean => code === '21' || code === '22'

/* ---------- building the dummy rows ---------- */

export function buildMasterContracts(seed: readonly McSeed[] = MC_SEED): MasterContract[] {
  return seed.map((s) => {
    const m = FX_MODELS.find((x) => x.code === s.model)
    const commodity = COMMODITIES.find((c) => c.code === s.comm)
    if (!m || !commodity) throw new Error(`bad Master Contract seed ${s.ref}`)
    const origin = m.entities[m.entities.length - 1] ?? ''
    const mcDate = parseDate(s.mcDate)
    const shipStart = addDays(mcDate, s.shipStartOff)
    const shipEnd = addDays(shipStart, s.shipDur)
    return {
      mcRef: s.ref,
      fxModel: s.model,
      modelDesc: m.desc,
      entities: m.entities,
      currChain: m.curr,
      originEntity: origin,
      region: entityOf(origin)?.region ?? '',
      commodityCode: s.comm,
      commodityDesc: commodity.desc,
      qty: s.qty,
      mcDate,
      amtUSD: s.amtUSD,
      shipStart,
      shipEnd,
      portOfShipment: s.port.ship,
      portOfDestination: s.port.dest,
    }
  })
}

export function buildDeals(mcs: readonly MasterContract[], seed: readonly DealSeed[] = DEAL_SEED): Deal[] {
  return seed.map((s, i) => {
    const mc = mcs.find((m) => m.mcRef === s.mc)
    const st = DEAL_STATUSES.find((x) => x.code === s.stat)
    if (!mc || !st) throw new Error(`bad Deal ID seed ${s.id}`)
    const trd = parseDate(s.trd)
    const val = parseDate(s.val)
    const createdOn = addDays(trd, -1)
    const changed = s.stat !== '01'
    return {
      dealId: s.id,
      dealType: 'FX1',
      subType: 'D1',
      dealDesc: `${mc.commodityDesc} deal under ${mc.mcRef} (${mc.fxModel})`,
      shortDesc: `${mc.commodityDesc.slice(0, 12)} ${s.id.slice(-4)}`,
      mcRef: s.mc,
      fxModel: mc.fxModel,
      modelDesc: mc.modelDesc,
      origin: mc.originEntity,
      region: mc.region,
      status: s.stat,
      statusDesc: st.desc,
      confirm: changed,
      tradeDate: trd,
      valueDate: val,
      revisedEndDate: statusIsSettled(s.stat) ? val : null,
      coArea: s.co,
      partner: PARTNER_BANKS[s.bank] ?? '',
      plAmt: s.pl,
      plCurr: 'USD',
      plRate: +(1 + (i % 7) * 0.013).toFixed(4),
      utiAmt: s.uti,
      fixingDay: addDays(val, -5),
      spot: s.spot,
      createdBy: i % 2 === 0 ? 'TINAKSHAYM' : 'AERAHULY',
      createdDate: createdOn,
      createdTime: `${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}:00`,
      changedBy: changed ? (i % 2 === 0 ? 'AERAHULY' : 'TINAKSHAYM') : '',
      changedDate: changed ? addDays(createdOn, 1 + (i % 4)) : null,
      changedTime: changed ? `${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00` : '',
    }
  })
}

export const dealsForMc = (deals: readonly Deal[], mcRef: string): Deal[] => deals.filter((d) => d.mcRef === mcRef)

/* ---------- KPI cards ---------- */

export function computeKpis(list: readonly Deal[]): Kpis {
  let pending = 0
  let settled = 0
  let utiTotal = 0
  for (const d of list) {
    if (statusIsSettled(d.status)) settled++
    else pending++
    utiTotal += d.utiAmt
  }
  return { total: list.length, pending, settled, utiTotal }
}

/** Clicking the active KPI card clears it; any other card selects it. */
export const nextKpiFilter = (current: KpiFilter, clicked: KpiFilter): KpiFilter => (current === clicked ? 'ALL' : clicked)

/* ---------- filtering / sorting ---------- */

export const DEFAULT_FILTERS: Filters = {
  search: '',
  deal: '',
  status: 'ALL',
  region: 'ALL',
  entity: 'ALL',
  co: DEFAULT_CO_AREA,
  dateFrom: '',
  dateTo: '',
  layout: 'DEFAULT',
  kpi: 'ALL',
  contextMc: null,
}

export const DEFAULT_SORT: Sort = { key: 'valueDate', dir: 1 }

export function matchesFilters(d: Deal, f: Filters): boolean {
  const q = f.search.trim().toLowerCase()
  if (q) {
    const hay = `${d.dealId} ${d.mcRef} ${d.partner} ${d.dealDesc}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  const dealText = f.deal.trim().toLowerCase()
  if (dealText && !d.dealId.toLowerCase().includes(dealText)) return false

  if (f.status !== 'ALL' && d.status !== f.status) return false

  if (f.kpi === 'OPEN' && statusIsSettled(d.status)) return false
  if (f.kpi === 'DONE' && !statusIsSettled(d.status)) return false

  if (f.region !== 'ALL' && d.region !== f.region) return false
  if (f.entity !== 'ALL' && d.origin !== f.entity) return false
  if (f.co && d.coArea !== f.co) return false

  if (f.dateFrom && d.valueDate < parseDate(f.dateFrom)) return false
  if (f.dateTo && d.valueDate > parseDate(f.dateTo)) return false

  if (f.contextMc && d.mcRef !== f.contextMc) return false
  return true
}

const sortValue = (d: Deal, key: SortKey): string | number => {
  const v = d[key]
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return v.toLowerCase()
  return v
}

/** A sorted copy; stable, strings compared case-insensitively, dates by time. */
export function sortDeals(list: readonly Deal[], sort: Sort): Deal[] {
  return [...list].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return 1 * sort.dir
    return 0
  })
}

export const visibleDeals = (deals: readonly Deal[], f: Filters, sort: Sort): Deal[] =>
  sortDeals(
    deals.filter((d) => matchesFilters(d, f)),
    sort,
  )

/** Clicking the sorted column flips direction; a new column starts ascending. */
export const toggleSort = (sort: Sort, key: SortKey): Sort =>
  sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 }

export const sortArrow = (sort: Sort, key: SortKey): string => (sort.key !== key ? '' : sort.dir === 1 ? '▲' : '▼')

/* ---------- paging ---------- */

export const totalPages = (count: number, pageSize: number): number => Math.max(1, Math.ceil(count / pageSize))

export const pageRows = <T>(list: readonly T[], page: number, pageSize: number): T[] =>
  list.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)

/** Page buttons: with more than 7 pages only first, last and the current page's neighbours show. */
export function pageWindow(pages: number, current: number): PagerItem[] {
  const items: PagerItem[] = []
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && p !== 1 && p !== pages && Math.abs(p - current) > 1) {
      if (p === 2 || p === pages - 1) items.push({ kind: 'gap', key: `gap${p}` })
      continue
    }
    items.push({ kind: 'page', page: p })
  }
  return items
}

export function pagerRange(count: number, page: number, pageSize: number): { start: number; end: number } {
  return { start: count ? (page - 1) * pageSize + 1 : 0, end: Math.min(count, page * pageSize) }
}

/* ---------- labels ---------- */

export const resultCountLabel = (count: number): string => `${count} deal ID${count === 1 ? '' : 's'}`

/** The "Key Date" note under the table; null when neither date is set. */
export function keyDateNote(from: string, to: string): string | null {
  if (!from && !to) return null
  return `${from || '…'}${to ? ` - ${to}` : ''}`
}

export const loadedMessage = (count: number, prefix: 'Ready' | 'Refreshed'): string => `${prefix}. ${count} Deal ID(s) loaded.`
export const layoutMessage = (label: string): string =>
  `Layout variant “${label}” applied (display only in this prototype).`
export const mcFilterMessage = (mcRef: string): string => `List filtered to Master Contract ${mcRef}.`

/* ---------- date picker ---------- */

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta
  let y = year
  if (m < 0) {
    m = 11
    y--
  }
  if (m > 11) {
    m = 0
    y++
  }
  return { year: y, month: m }
}

export const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()
/** Blank cells before the 1st (the grid starts on Sunday). */
export const leadingBlanks = (year: number, month: number): number => new Date(year, month, 1).getDay()

/* ---------- invoice drill-down ---------- */

/**
 * One invoice per leg of the Entity String. The first leg is invoiced at the utilised amount;
 * each onward leg adds a small, increasing trade markup on the running amount.
 */
export function invoiceLegs(deal: Deal, mc: MasterContract): InvoiceLeg[] {
  const legs = mc.entities.length - 1
  const base = deal.utiAmt
  let cumulative = base
  const rows: InvoiceLeg[] = []
  for (let i = 0; i < legs; i++) {
    const markupPct = 0.001 + i * 0.0012
    const markupAmt = i === 0 ? 0 : cumulative * markupPct
    cumulative = i === 0 ? base : cumulative + markupAmt
    rows.push({
      leg: `T${i + 1}${i === legs - 1 ? ' (final)' : ''}`,
      seller: mc.entities[i] ?? '',
      buyer: mc.entities[i + 1] ?? '',
      curr: mc.currChain[i + 1] ?? '',
      amt: cumulative,
      markup: i === 0 ? null : markupAmt,
    })
  }
  return rows
}
