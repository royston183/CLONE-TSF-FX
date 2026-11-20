import { apiFetch, service } from '@slc/api-client'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { txt } from '../../shared/fx/masters.ts'

/**
 * The FX position dashboard (Reporting > FX Structure), read from the Deal ID table:
 *
 *   tsfDealId      ZSGTSFTR_DEALID  the Deal IDs: status, model, end date, USD volume (ZDEAL_AMT), planned P&L (ZPL)
 *   tsfvFx         ZSGTSFV_FX       the FX legs, for the counterparty bank (KONTRH / BP_NAME) of each Deal ID
 *   tsfDealStatus  status texts     fxModel  model codes
 *
 * Demo Deal IDs (imported from the deal dump into the local store: tools/import-demo-deals.mjs) are added to what SAP returns;
 * a Deal ID the live read also has is taken from the live read.
 *
 * The population is every Deal ID that is not cancelled (status 30) and ends on or after the key date.
 * Everything below `loadPositionRaw` is pure, so changing the key date re-computes without another read.
 */

export type PositionRaw = {
  dealIds: FxRow[]
  /** null when the FX legs could not be read: banks then show as Unassigned. */
  fx: FxRow[] | null
  statuses: FxRow[]
  models: FxRow[]
  problems: string[]
  loadedAt: Date
}

export async function loadPositionRaw(signal?: AbortSignal): Promise<PositionRaw> {
  const problems: string[] = []
  const optional = async (resource: string, label: string, filter: Record<string, string> = {}): Promise<FxRow[] | null> => {
    try {
      return await fxList(resource, filter, { signal })
    } catch (error) {
      if (signal?.aborted || isAbort(error)) throw error
      problems.push(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
  const demo = (name: string) => demoRows(name, signal)
  const [liveIds, fx, statuses, models, demoIds, demoFx, demoStatuses] = await Promise.all([
    optional('tsfDealId', 'Deal IDs'),
    optional('tsfvFx', 'FX legs (bank names)'),
    optional('tsfDealStatus', 'Deal ID status texts', { ZDEAL_TYPE: 'FX' }),
    optional('fxModel', 'FX models'),
    demo('demo_dealid'),
    demo('demo_fx'),
    demo('demo_status'),
  ])
  if (!liveIds && !demoIds.length) throw new Error(problems[0] ?? 'The Deal IDs could not be read.')
  const known = new Set((liveIds ?? []).map((d) => txt(d, 'ZDEAL_ID')))
  const dealIds = [...(liveIds ?? []), ...demoIds.filter((d) => !known.has(txt(d, 'ZDEAL_ID')))]
  return {
    dealIds,
    fx: fx || demoFx.length ? [...(fx ?? []), ...demoFx] : null,
    statuses: [...(statuses ?? []), ...demoStatuses],
    models: models ?? [],
    problems,
    loadedAt: new Date(),
  }
}

/** A collection of the local store, or nothing when it is empty or cannot be read: the demo data is optional. */
async function demoRows(collection: string, signal?: AbortSignal): Promise<FxRow[]> {
  try {
    const body = await apiFetch<{ value?: FxRow[] }>(`${service('local')(collection)}?$top=5000`, signal ? { signal } : undefined)
    return body?.value ?? []
  } catch (error) {
    if (signal?.aborted || isAbort(error)) throw error
    return []
  }
}

// ------------------------------------------------------------------ pure part

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

export type PositionDeal = {
  id: string
  description: string
  bank: string
  model: string
  statusCode: string
  status: string
  /** ISO end date (the revised end date when there is one). */
  end: string
  year: number
  month: number
  /** ZDEAL_AMT: the Deal ID's USD amount. */
  volume: number
  /** ZPL: the planned P&L in USD. */
  pl: number
}

const stripZeros = (s: string) => s.replace(/^0+/, '')

/** The counterparty bank of a Deal ID: the first of its legs that the FX view knows, "code - name". */
function bankOf(deal: FxRow, legs: Map<string, FxRow> | null): string {
  // A Deal ID created by the import page carries its bank after a "|" in the description: "DAIRY - M032 | 0011000000 - DBS BANK LTD".
  const tagged = txt(deal, 'ZDEAL_DESC').split('|')[1]?.trim() ?? ''
  if (/^d{10} - /.test(tagged)) return tagged
  if (!legs) return 'Unassigned'
  for (let slot = 1; slot <= 8; slot++) {
    const rfha = txt(deal, 'ZRFHA' + slot)
    if (!rfha) continue
    const leg = legs.get(`${txt(deal, 'ZBUKRS' + slot)}|${stripZeros(rfha)}`)
    if (!leg) continue
    const code = txt(leg, 'KONTRH')
    const name = txt(leg, 'BP_NAME')
    const label = [code, name].filter(Boolean).join(' - ')
    if (label) return label
  }
  return 'Unassigned'
}

/** The Deal IDs that are live on the key date, each with what the four panels group by. */
export function positionDeals(raw: PositionRaw, keyDate: string): PositionDeal[] {
  const legs = raw.fx ? new Map(raw.fx.map((r) => [`${txt(r, 'BUKRS')}|${stripZeros(txt(r, 'RFHA'))}`, r])) : null
  const out: PositionDeal[] = []
  for (const d of raw.dealIds) {
    const code = txt(d, 'ZDEAL_STAT')
    const end = txt(d, 'ZREV_DEDATE') || txt(d, 'ZE_DATE')
    if (code === '30' || !end || end < keyDate) continue
    const status = raw.statuses.find((s) => txt(s, 'ZDEAL_TYPE') === txt(d, 'ZDEAL_TYPE') && txt(s, 'ZSUB_TYPE') === txt(d, 'ZSUB_TYPE') && txt(s, 'ZDEAL_STAT') === code)
    out.push({
      id: txt(d, 'ZDEAL_ID'),
      description: txt(d, 'ZDEAL_DESC'),
      bank: bankOf(d, legs),
      model: txt(d, 'ZTSF_MODEL') || '—',
      statusCode: code,
      status: (status && txt(status, 'ZDEAL_SDESC')) || code || '—',
      end,
      year: Number(end.slice(0, 4)),
      month: Number(end.slice(5, 7)) - 1,
      volume: num(d['ZDEAL_AMT']),
      pl: num(d['ZPL']),
    })
  }
  return out
}

export type Group = { label: string; volume: number; count: number; share: number; code?: string }

function group(deals: PositionDeal[], key: (d: PositionDeal) => string, code?: (d: PositionDeal) => string): Group[] {
  const map = new Map<string, Group>()
  const total = deals.reduce((s, d) => s + d.volume, 0)
  for (const d of deals) {
    const label = key(d)
    const g = map.get(label) ?? { label, volume: 0, count: 0, share: 0, ...(code ? { code: code(d) } : {}) }
    g.volume += d.volume
    g.count += 1
    map.set(label, g)
  }
  const groups = [...map.values()]
  for (const g of groups) g.share = total ? (g.volume / total) * 100 : 0
  return groups
}

/** Year x column grid of one measure, with row, column and grand totals. */
export type Grid = { years: number[]; columns: string[]; cells: Record<number, Record<string, number>>; rowTotal: Record<number, number>; colTotal: Record<string, number>; total: number }

function grid(deals: PositionDeal[], column: (d: PositionDeal) => string, columns: string[], measure: (d: PositionDeal) => number): Grid {
  const years = [...new Set(deals.map((d) => d.year))].sort((a, b) => a - b)
  const cells: Grid['cells'] = {}
  const rowTotal: Grid['rowTotal'] = {}
  const colTotal: Grid['colTotal'] = Object.fromEntries(columns.map((c) => [c, 0]))
  let total = 0
  for (const y of years) {
    cells[y] = Object.fromEntries(columns.map((c) => [c, 0]))
    rowTotal[y] = 0
  }
  for (const d of deals) {
    const c = column(d)
    const v = measure(d)
    cells[d.year]![c] = (cells[d.year]![c] ?? 0) + v
    rowTotal[d.year] = (rowTotal[d.year] ?? 0) + v
    colTotal[c] = (colTotal[c] ?? 0) + v
    total += v
  }
  return { years, columns, cells, rowTotal, colTotal, total }
}

export type PositionView = {
  deals: PositionDeal[]
  volume: number
  banks: Group[]
  statuses: Group[]
  ladder: Grid
  pl: Grid
}

export function buildPosition(raw: PositionRaw, keyDate: string): PositionView {
  const deals = positionDeals(raw, keyDate)
  const models = [...new Set(deals.map((d) => d.model))].sort()
  return {
    deals,
    volume: deals.reduce((s, d) => s + d.volume, 0),
    banks: group(deals, (d) => d.bank).sort((a, b) => b.volume - a.volume),
    statuses: group(deals, (d) => d.status, (d) => d.statusCode).sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
    ladder: grid(deals, (d) => MONTHS[d.month] ?? '', [...MONTHS], (d) => d.volume),
    pl: grid(deals, (d) => d.model, models, (d) => d.pl),
  }
}

// ------------------------------------------------------------------ drill-down

export type PositionDetail = { title: string; rows: Record<string, string>[]; columns: string[]; unavailable: boolean }

const COLUMNS = ['Deal ID', 'Description', 'Bank', 'FX model', 'Status', 'End date', 'USD volume', 'Planned P&L (USD)']
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = (iso: string) => iso.split('-').reverse().join('-')

/** The Deal IDs behind a card or one mark of its chart (a bank, a status, "year|MONTH" or "year|model"). */
export function positionDetail(deals: PositionDeal[], title: string, mark = ''): PositionDetail {
  let rows = deals
  if (mark) {
    if (title.startsWith('BP wise')) rows = deals.filter((d) => d.bank === mark)
    else if (title.startsWith('Deal ID status')) rows = deals.filter((d) => d.status === mark)
    else {
      const [year, rest = ''] = mark.split('|')
      const byMonth = title.startsWith('Maturity')
      rows = deals.filter((d) => String(d.year) === year && (!rest || (byMonth ? MONTHS[d.month] === rest : d.model === rest)))
    }
  }
  return {
    title: title + (mark ? ' · ' + mark.replaceAll('|', ' · ') : ''),
    columns: COLUMNS,
    unavailable: false,
    rows: rows.map((d) => ({
      'Deal ID': d.id, Description: d.description, Bank: d.bank, 'FX model': d.model, Status: d.status,
      'End date': dmy(d.end), 'USD volume': money(d.volume), 'Planned P&L (USD)': money(d.pl),
    })),
  }
}
