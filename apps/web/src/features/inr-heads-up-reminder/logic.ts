import {
  ABAP,
  AUTH_ERROR_PREFIX,
  BANKS,
  COLUMNS,
  CURRENT_USER,
  DEAL_SEEDS,
  DEFAULT_CO_AREA,
  ENTITIES,
  LAYOUT_COLUMNS,
  MAIL_SUCCESS_TEXT,
  MC_SEED,
  MODELS,
  REGIONS,
  SETTLED_STAGE_STATUSES,
  STATUSES,
  USERS,
} from './data.ts'
import {
  addDaysISO,
  compactAmount,
  dateToISO,
  formatAmount,
  formatDMY,
  formatRate,
  isoToDMY,
  pad2,
  parseDMY,
  trimMillions,
} from './format.ts'
import type {
  CalendarGrid,
  Column,
  ColumnKey,
  Deal,
  DealStatus,
  Entity,
  FetchResult,
  Filters,
  FxLeg,
  HeadsUpRow,
  Leg,
  MailPlan,
  MasterContract,
  MasterContractDetail,
  Model,
  Region,
  Sort,
  Tables,
  TypedDateResult,
} from './types.ts'

/* ---------- lookups ---------- */

export const findEntity = (code: string): Entity | undefined => ENTITIES.find((e) => e.code === code)
export const findRegion = (id: string): Region | undefined => REGIONS.find((r) => r.id === id)
export const findStatus = (code: string): DealStatus | undefined => STATUSES.find((s) => s.code === code)
export const modelRule = (id: string): Model | undefined => MODELS.find((m) => m.id === id)
export const findMcByRef = (tables: Tables, ref: string): MasterContract | undefined =>
  tables.masterContracts.find((m) => m.ref === ref)

/* ---------- selection screen ---------- */

export function initialFilters(): Filters {
  return { keyDate: '', region: '', entity: '', dealId: '', status: '', coArea: DEFAULT_CO_AREA }
}

export const DEFAULT_SORT: Sort = { field: 'dealId', dir: 'asc' }

/* ---------- business logic ---------- */

/** "Model extension" (SUB_GET_DATA): M030 / M034 get a currency suffix after the CO-area lookup. */
export function extendModelId(modelId: string, currId: string): string {
  const suffix = ABAP.MODEL_EXT_BY_CURR[currId]
  if (ABAP.MODEL_EXT_BASE.includes(modelId) && suffix) return modelId + suffix
  return modelId
}

/** Absolute USD-side amount of one leg; 0 when neither side is USD. */
export function legUsdAmount(leg: Leg): number {
  if (leg.curr1 === 'USD') return Math.abs(leg.amt1)
  if (leg.curr2 === 'USD') return Math.abs(leg.amt2)
  return 0
}

/**
 * FX / option utilisation amount: absolute USD-side amount of the deal's legs.
 * The ABAP loops from the first D1 row to the end of the table without leaving on a deal
 * change; the intended per-deal total is implemented here, as the original does.
 */
export function calculateUtilisation(tables: Tables, dealId: string): number {
  let total = 0
  for (const legs of [tables.fxLegs, tables.optLegs]) {
    const mine = legs.filter((l) => l.dealId === dealId)
    if (mine.some((l) => l.type === ABAP.LEG_TYPE)) {
      for (const l of mine) total += legUsdAmount(l)
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Mail plan of SEND_EMAIL: status 05/07, model sub type FX1 -> FX mails (indicator on the full
 * model id); FX2 -> option mails (indicator on the first 4 chars of the model id).
 */
export function mailPlanForRow(row: Pick<HeadsUpRow, 'status' | 'modelId'>): string[] {
  if (!ABAP.MAIL_STATUSES.includes(row.status)) return []
  const rule = modelRule(row.modelId.substring(0, 4))
  if (!rule) return []
  if (rule.subType === ABAP.SUB_FX1) {
    const full = modelRule(row.modelId)
    if (full?.headFx) return ['Heads Up FX', 'Heads Up FX for DMCC']
  } else if (rule.subType === ABAP.SUB_FX2) {
    if (rule.headOpt) return ['Heads Up Option', 'Heads Up Option for DMCC']
  }
  return []
}

export function buildMailPlan(rows: readonly Pick<HeadsUpRow, 'dealId' | 'status' | 'modelId'>[]): MailPlan {
  const plan: MailPlan = { deals: [], mailCount: 0 }
  for (const r of rows) {
    const mails = mailPlanForRow(r)
    if (mails.length) {
      plan.deals.push({ dealId: r.dealId, mails })
      plan.mailCount += mails.length
    }
  }
  return plan
}

/** Whether Send Mail is enabled, and the tooltip that says why not. */
export function sendMailState(error: string | null, plan: MailPlan): { disabled: boolean; title: string } {
  const can = !error && plan.deals.length > 0
  return {
    disabled: !can,
    title: can
      ? 'Send heads-up mail for the deals matching the selection'
      : error
        ? 'Not available without CO Area authorization'
        : 'No deal with status 05 / 07 and a heads-up indicator in the selection',
  }
}

/* ---------- mock table builder (deterministic) ---------- */

export function mcDescription(mc: Pick<MasterContract, 'origin' | 'commodity' | 'modelId' | 'amt'>): string {
  return `${mc.origin}_${mc.commodity}_${mc.modelId}_${trimMillions(mc.amt)}M`
}

export function buildMockTables(): Tables {
  const masterContracts: MasterContract[] = MC_SEED.map((mc) => ({ ...mc, ref: `MC/${mc.origin}/2026/${mc.no}` }))
  const tables: Tables = { masterContracts, deals: [], fxLegs: [], optLegs: [], spotDealIds: {} }

  DEAL_SEEDS.forEach((s, i) => {
    const [mcNo, startDate, maturityDate, status, confirmed, usd] = s
    const mc = masterContracts.find((m) => m.no === mcNo)
    const rule = mc && modelRule(mc.modelId)
    const entity = mc && findEntity(mc.origin)
    if (!mc || !rule || !entity) return
    const dealId = String(1000004101 + i)
    const settledStage = SETTLED_STAGE_STATUSES.includes(status)
    const plAmt = settledStage ? Math.round(usd * 0.0125 * (i % 2 ? -1 : 1) * 100) / 100 : 0

    tables.deals.push({
      dealId,
      dealType: ABAP.LEG_TYPE,
      subType: rule.subType,
      dealDesc: `${mc.origin} ${rule.desc} USD ${compactAmount(usd)}`,
      startDate,
      maturityDate,
      mcRef: mc.ref,
      status,
      confirmed: !!confirmed,
      plAmt,
      plCurr: settledStage ? 'USD' : '',
      plRate: settledStage ? entity.fxRate + 0.4 : 0,
      currId: mc.currId,
      createdBy: USERS[i % 4] ?? '',
      createdDate: startDate,
      createdTime: `${pad2(8 + (i % 9))}:${pad2((i * 7) % 60)}:${pad2((i * 13) % 60)}`,
      changedBy: USERS[(i + 1) % 4] ?? '',
      changedDate: addDaysISO(startDate, (i % 5) + 1),
      changedTime: `${pad2(9 + (i % 8))}:${pad2((i * 11) % 60)}:${pad2((i * 17) % 60)}`,
    })

    if (rule.subType === ABAP.SUB_FX1) {
      const ndf = ABAP.NDF_MODELS.includes(mc.modelId)
      const leg: FxLeg = {
        dealId,
        type: ABAP.LEG_TYPE,
        curr1: 'USD',
        curr2: entity.currency,
        amt1: usd,
        amt2: -Math.round(usd * entity.fxRate * 100) / 100,
        sgsart: ndf ? ABAP.EXT_PRODUCT_NDF : ABAP.EXT_PRODUCT_OTHER,
        bp: ndf ? (BANKS[i % BANKS.length] ?? '') : '',
        ndfDate: ndf ? addDaysISO(maturityDate, -2) : '',
      }
      tables.fxLegs.push(leg)
    } else {
      // Staggered / put & call options: two legs, alternating which side holds USD.
      const half = Math.round((usd / 2) * 100) / 100
      tables.optLegs.push({
        dealId,
        type: ABAP.LEG_TYPE,
        curr1: 'INR',
        curr2: 'USD',
        amt1: Math.round(half * entity.fxRate * 100) / 100,
        amt2: -half,
      })
      tables.optLegs.push({
        dealId,
        type: ABAP.LEG_TYPE,
        curr1: 'USD',
        curr2: 'INR',
        amt1: usd - half,
        amt2: -Math.round((usd - half) * entity.fxRate * 100) / 100,
      })
    }
    if (settledStage) tables.spotDealIds[dealId] = true
  })
  return tables
}

/* ---------- data / service layer (mock; swap for API calls) ---------- */

export function buildRow(tables: Tables, d: Deal, coArea: string): HeadsUpRow | null {
  const mc = findMcByRef(tables, d.mcRef)
  const entity = mc && findEntity(mc.origin)
  if (!mc || !entity) return null
  const status = findStatus(d.status)
  const baseRule = modelRule(mc.modelId)
  const coRule = MODELS.find((m) => m.coArea === coArea && m.id === mc.modelId)
  const ndfLeg = tables.fxLegs.find((l) => l.dealId === d.dealId && l.sgsart === ABAP.EXT_PRODUCT_NDF)
  return {
    dealId: d.dealId,
    dealType: d.dealType,
    subType: d.subType,
    dealDesc: d.dealDesc,
    startDate: d.startDate,
    maturityDate: d.maturityDate,
    mcRef: d.mcRef,
    status: d.status,
    statusDesc: status ? status.sdesc : '',
    origin: mc.origin,
    region: entity.regionId,
    modelId: extendModelId(mc.modelId, d.currId),
    modelDesc: baseRule?.desc ?? '',
    coArea: coRule ? coRule.coArea : '',
    coModelDesc: coRule ? coRule.desc : '',
    mcDesc: mcDescription(mc),
    mcDate: mc.date,
    mcAmt: mc.amt,
    utiAmt: calculateUtilisation(tables, d.dealId),
    dealCurrId: d.currId,
    confirmed: d.confirmed,
    plAmt: d.plAmt,
    plCurr: d.plCurr,
    plRate: d.plRate,
    ndfDate: ndfLeg ? ndfLeg.ndfDate : '',
    bank: ndfLeg ? ndfLeg.bp : '',
    spot: !!tables.spotDealIds[d.dealId],
    createdBy: d.createdBy,
    createdDate: d.createdDate,
    createdTime: d.createdTime,
    changedBy: d.changedBy,
    changedDate: d.changedDate,
    changedTime: d.changedTime,
  }
}

/** SUB_GET_DATA + DATA_FILTER. An unauthorized CO area gives an error and no rows. */
export function fetchDeals(tables: Tables, p: Filters): FetchResult {
  if (p.coArea && !CURRENT_USER.authorizedCoAreas.includes(p.coArea)) {
    return { error: AUTH_ERROR_PREFIX + p.coArea, rows: [] }
  }
  const rows: HeadsUpRow[] = []
  for (const d of tables.deals) {
    if (!d.mcRef) continue
    if (p.dealId && d.dealId !== p.dealId) continue
    const mc = findMcByRef(tables, d.mcRef)
    const entity = mc && findEntity(mc.origin)
    if (!mc || !entity) continue
    if (p.keyDate && d.maturityDate !== p.keyDate) continue // ze_date <> p_date -> deleted
    if (p.status && d.status !== p.status) continue
    if (p.region && entity.regionId !== p.region) continue
    if (p.entity && mc.origin !== p.entity) continue
    const row = buildRow(tables, d, p.coArea)
    if (row) rows.push(row)
  }
  return { error: null, rows }
}

/** Stand-in for ZSGTSFFM_MC_DETAILS. */
export function getMasterContract(tables: Tables, ref: string): MasterContractDetail | null {
  const mc = findMcByRef(tables, ref)
  if (!mc) return null
  const entity = findEntity(mc.origin)
  const rule = modelRule(mc.modelId)
  return {
    ref: mc.ref,
    origin: mc.origin,
    originName: entity?.name ?? '',
    region: entity?.regionId ?? '',
    modelId: mc.modelId,
    modelDesc: rule?.desc ?? '',
    currId: mc.currId,
    desc: mcDescription(mc),
    commodity: mc.commodity,
    date: mc.date,
    amt: mc.amt,
  }
}

/** Stand-in for the zsgtsfcl_class heads-up e-mail methods; returns the text the class returns. */
export function sendHeadsUpMails(rows: readonly HeadsUpRow[]): { plan: MailPlan; texts: string[] } {
  const plan = buildMailPlan(rows)
  return { plan, texts: plan.mailCount ? [MAIL_SUCCESS_TEXT] : [] }
}

/* ---------- columns, cell text, search, sort ---------- */

export function columnByKey(key: string): Column | undefined {
  return COLUMNS.find((c) => c.key === key)
}

export function visibleColumns(layout: string): Column[] {
  const keys = LAYOUT_COLUMNS[layout] ?? LAYOUT_COLUMNS['']
  const cols: Column[] = []
  for (const k of keys ?? []) {
    const c = columnByKey(k)
    if (c) cols.push(c)
  }
  return cols
}

/** The text a cell shows, also used for search and the CSV export. */
export function cellText(col: Column, row: HeadsUpRow): string {
  const v = row[col.key]
  switch (col.type) {
    case 'date':
      return isoToDMY(typeof v === 'string' ? v : '')
    case 'amt':
      return v === '' ? '' : formatAmount(typeof v === 'number' ? v : 0)
    case 'rate':
      return v === '' ? '' : formatRate(typeof v === 'number' ? v : 0)
    case 'flag':
      return v ? 'X' : ''
    default:
      return String(v)
  }
}

function sortValue(col: Column, row: HeadsUpRow): string | number {
  const v = row[col.key]
  if (col.type === 'amt' || col.type === 'rate') return Number(v) || 0
  if (col.type === 'flag') return v ? 1 : 0
  return String(v).toLowerCase()
}

function compareValues(x: string | number, y: string | number): number {
  if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : x > y ? 1 : 0
  const a = String(x)
  const b = String(y)
  return a < b ? -1 : a > b ? 1 : 0
}

/** Rows matching the search text in any visible column, ordered by the sort (ties by Deal ID). */
export function filterSortRows(rows: readonly HeadsUpRow[], layout: string, search: string, sort: Sort): HeadsUpRow[] {
  const cols = visibleColumns(layout)
  const q = search.trim().toLowerCase()
  let list = rows.filter((r) => !q || cols.some((c) => cellText(c, r).toLowerCase().includes(q)))
  const col = columnByKey(sort.field)
  if (col) {
    const dir = sort.dir === 'asc' ? 1 : -1
    list = list.slice().sort((a, b) => {
      const c = compareValues(sortValue(col, a), sortValue(col, b))
      if (c !== 0) return c * dir
      return a.dealId < b.dealId ? -1 : 1
    })
  }
  return list
}

/** Header click: the same column flips direction, another column starts ascending. */
export function nextSort(sort: Sort, key: ColumnKey): Sort {
  if (sort.field === key) return { field: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field: key, dir: 'asc' }
}

/** The sort survives a layout change only while its column is still in the layout. */
export function sortForLayout(sort: Sort, layout: string): Sort {
  const keys = LAYOUT_COLUMNS[layout] ?? []
  if (!columnByKey(sort.field) || !keys.includes(sort.field)) return DEFAULT_SORT
  return sort
}

export function sortArrow(sort: Sort, key: ColumnKey): string {
  if (sort.field !== key) return ''
  return sort.dir === 'asc' ? '▲' : '▼'
}

/* ---------- pagination ---------- */

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function resultCountLabel(total: number, page: number, pageSize: number): string {
  if (total === 0) return '0 deals'
  const start = (page - 1) * pageSize
  return `${start + 1}–${Math.min(start + pageSize, total)} of ${total}${total === 1 ? ' deal' : ' deals'}`
}

/** The selected deal stays selected only while it is still listed. */
export function pruneSelection(selectedId: string | null, rows: readonly Pick<HeadsUpRow, 'dealId'>[]): string | null {
  return selectedId && rows.some((r) => r.dealId === selectedId) ? selectedId : null
}

/** Rows of the Deal ID dropdown whose "<id> <description>" contains the typed text. */
export function dealOptions(deals: readonly Deal[], text: string): Deal[] {
  const ft = text.toLowerCase()
  return deals.filter((d) => `${d.dealId} ${d.dealDesc}`.toLowerCase().includes(ft))
}

/* ---------- export ---------- */

const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`

/** CSV text of the listed rows: BOM, quoted cells, CRLF line ends. */
export function buildCsv(cols: readonly Column[], rows: readonly HeadsUpRow[]): string {
  const lines = [cols.map((c) => quote(c.label)).join(',')]
  for (const r of rows) lines.push(cols.map((c) => quote(cellText(c, r))).join(','))
  return '﻿' + lines.join('\r\n')
}

/* ---------- Key Date box ---------- */

/** Typing: applied as soon as the text is a complete valid date (10 characters), or empty. */
export function typedDateOnInput(text: string): TypedDateResult {
  const v = text.trim()
  if (v === '') return { kind: 'clear' }
  const dt = parseDMY(v)
  if (dt && v.length === 10) {
    return { kind: 'commit', iso: dateToISO(dt), text: v, view: { year: dt.getFullYear(), month: dt.getMonth() } }
  }
  return { kind: 'none' }
}

/** Blur / Enter: empty clears, a valid date is reformatted and applied, anything else is an error. */
export function typedDateOnCommit(text: string): TypedDateResult {
  const v = text.trim()
  if (v === '') return { kind: 'clear' }
  const dt = parseDMY(v)
  if (dt) return { kind: 'commit', iso: dateToISO(dt), text: formatDMY(dt), view: { year: dt.getFullYear(), month: dt.getMonth() } }
  return { kind: 'error' }
}

/* ---------- calendar ---------- */

export function calendarGrid(year: number, month: number): CalendarGrid {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDim = new Date(year, month, 0).getDate()
  const leading = Array.from({ length: firstDow }, (_, i) => prevDim - firstDow + 1 + i)
  const trailing = Array.from({ length: (7 - ((firstDow + daysInMonth) % 7)) % 7 }, (_, i) => i + 1)
  return { leading, daysInMonth, trailing }
}

/** The year list always includes the year on show. */
export function yearRange(year: number): number[] {
  const y0 = Math.min(2020, year)
  const y1 = Math.max(2035, year)
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
}

export function shiftMonth(view: { year: number; month: number }, delta: number): { year: number; month: number } {
  const d = new Date(view.year, view.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** The month the calendar opens on: the one holding the typed date, else the current month. */
export function viewForText(text: string, now: Date = new Date()): { year: number; month: number } {
  const sel = parseDMY(text)
  const base = sel ?? now
  return { year: base.getFullYear(), month: base.getMonth() }
}
