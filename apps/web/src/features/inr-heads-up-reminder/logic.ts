import { ABAP, COLUMNS, LAYOUT_COLUMNS, STATUS_TONE } from './data.ts'
import { dateToISO, formatAmount, formatDMY, formatRate, isoToDMY, parseDMY } from './format.ts'
import type {
  CalendarGrid,
  Column,
  ColumnKey,
  Deal,
  Entity,
  Filters,
  FxLeg,
  HeadsUpIndicator,
  HeadsUpRow,
  Leg,
  MailPlan,
  MasterContractDetail,
  Region,
  RuleBt,
  ScreenData,
  Sort,
  StatusTone,
  TypedDateResult,
} from './types.ts'

/* ---------- selection screen ---------- */

/** P_CO has no default in the report, so the CO Area starts empty. */
export function initialFilters(): Filters {
  return { keyDate: '', region: '', entity: '', dealId: '', status: '', coArea: '' }
}

export const DEFAULT_SORT: Sort = { field: 'dealId', dir: 'asc' }

export const EMPTY_DATA: ScreenData = {
  deals: [],
  masterContracts: [],
  entities: [],
  statuses: [],
  rules: [],
  indicators: [],
  spotDealIds: {},
  fxLegs: null,
  optLegs: null,
}

export const statusTone = (code: string): StatusTone => STATUS_TONE[code] ?? 'draft'

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** ZSGTSFSH_REGION: the distinct region codes of ZSGTSFTR_COMP (no region text table is served). */
export function regionOptions(entities: readonly Entity[], sap: readonly { id: string; name: string }[] | null = null): Region[] {
  // The SAP region list (shared/fx/regions.ts) when it loaded; else the entities' COMP codes.
  if (sap?.length) return sap.map((r) => ({ id: r.id, name: r.name }))
  return [...new Set(entities.map((e) => e.regionId).filter(Boolean))].sort(byText).map((id) => ({ id, name: '' }))
}

/**
 * P_CO is a plain KOKRS parameter (F4 on TKA01, which no API serves). The list offers the CO
 * areas ZSGTSFTR_RULE_BT is maintained for, the only values the report's
 * `SELECT ... FROM zsgtsftr_rule_bt WHERE zco_area = @p_co` can match.
 */
export function coAreaOptions(rules: readonly RuleBt[]): string[] {
  return [...new Set(rules.map((r) => r.coArea).filter(Boolean))].sort(byText)
}

/* ---------- business logic (FORM sub_get_data / data_filter / send_email) ---------- */

/** "Model extension" (SUB_GET_DATA): M030 / M034 get a currency suffix after the CO-area lookup. */
export function extendModelId(modelId: string, currId: string): string {
  const suffix = ABAP.MODEL_EXT_BY_CURR[currId]
  if (ABAP.MODEL_EXT_BASE.includes(modelId) && suffix) return modelId + suffix
  return modelId
}

/** Absolute USD-side amount of one leg; 0 when neither side is USD. */
export function legUsdAmount(leg: Leg): number {
  if (leg.curr1 === ABAP.USD) return Math.abs(leg.amt1)
  if (leg.curr2 === ABAP.USD) return Math.abs(leg.amt2)
  return 0
}

/** SORT lt_fx / lt_op BY ztsf_deal_id ztsf_deal_type (stable here). */
export function sortLegs<T extends Leg>(legs: readonly T[]): T[] {
  return legs.slice().sort((a, b) => byText(a.dealId, b.dealId) || byText(a.type, b.type))
}

/**
 * The report's utilization "parallel cursor", reproduced exactly: from the first row of the
 * deal with ztsf_deal_type 'D1', LOOP AT ... FROM lv_index runs to the END of the sorted table
 * (there is no EXIT on a deal change), so the legs of every later Deal ID in the selection are
 * added too. That is what SAP shows; it is not the per-deal total. `sorted` must be sortLegs().
 */
export function abapUtilisation(sorted: readonly Leg[], dealId: string): number {
  const from = sorted.findIndex((l) => l.dealId === dealId && l.type === ABAP.LEG_TYPE)
  if (from < 0) return 0
  let total = 0
  for (let i = from; i < sorted.length; i++) total += legUsdAmount(sorted[i] as Leg)
  return Math.round(total * 100) / 100
}

/** LEFT OUTER JOIN zsgtsftr_deal_st ON zdeal_stat = a~zdeal_stat AND zsub_type = 'FX1'. */
export function statusText(data: Pick<ScreenData, 'statuses'>, code: string): string {
  return data.statuses.find((s) => s.code === code)?.sdesc ?? ''
}

/**
 * SUB_GET_DATA + DATA_FILTER. ZSGTSFTR_DEALID WHERE zmc_ref <> space, LEFT OUTER JOINed to
 * MAS_CON (on zmc_ref_no), COMP (on zcom_id = MC origin) and DEAL_ST ('FX1'); then the in-program
 * deletes: s_deal, p_date (ze_date <> p_date), p_stat, s_reg, s_org. The legs are read FOR ALL
 * ENTRIES of the remaining rows' MC references, sorted, and summed per row as the report does.
 * The model is looked up in RULE_BT at the selected CO area before the model extension.
 *
 * AUTHORITY-CHECK C_PROJ_KOK (KOKRS = P_CO, ACTVT 03): WAITING FOR AUTH — no browser source for
 * the user's authorizations, so nothing is refused here.
 */
export function selectRows(data: ScreenData, p: Filters): HeadsUpRow[] {
  const mcs = new Map(data.masterContracts.map((m) => [m.ref, m]))
  const comp = new Map<string, Entity>()
  for (const e of data.entities) if (!comp.has(e.code)) comp.set(e.code, e)

  const picked = data.deals
    .filter((d) => d.mcRef !== '')
    .map((d) => {
      const mc = mcs.get(d.mcRef)
      const entity = mc ? comp.get(mc.origin) : undefined
      return { d, mc, origin: mc?.origin ?? '', region: entity?.regionId ?? '' }
    })
    .filter(({ d }) => !p.dealId || d.dealId === p.dealId)
    .filter(({ d }) => !p.keyDate || d.maturityDate === p.keyDate)
    .filter(({ d }) => !p.status || d.status === p.status)
    .filter((r) => !p.region || r.region === p.region)
    .filter((r) => !p.entity || r.origin === p.entity)

  const refs = new Set(picked.map((r) => r.d.mcRef))
  const fx = data.fxLegs ? sortLegs(data.fxLegs.filter((l) => refs.has(l.mcRef))) : null
  const op = data.optLegs ? sortLegs(data.optLegs.filter((l) => refs.has(l.mcRef))) : null
  const rulesAtCo = data.rules.filter((r) => r.coArea === p.coArea)

  return picked.map(({ d, mc, origin, region }) => {
    const ndf: FxLeg | undefined = fx?.find((l) => l.dealId === d.dealId && l.sgsart === ABAP.EXT_PRODUCT_NDF)
    const baseModel = mc?.modelId ?? ''
    const rule = rulesAtCo.find((r) => r.id === baseModel)
    return {
      dealId: d.dealId,
      dealType: d.dealType,
      subType: d.subType,
      dealDesc: d.dealDesc,
      startDate: d.startDate,
      maturityDate: d.maturityDate,
      mcRef: d.mcRef,
      status: d.status,
      statusDesc: statusText(data, d.status),
      origin,
      region,
      modelId: extendModelId(baseModel, d.currId),
      modelDesc: mc?.modelDesc ?? '',
      coArea: rule?.coArea ?? '',
      coModelDesc: rule?.desc ?? '',
      mcDesc: mc?.desc ?? '',
      mcDate: mc?.date ?? '',
      mcAmt: mc?.amt ?? 0,
      utiAmt: fx && op ? Math.round((abapUtilisation(fx, d.dealId) + abapUtilisation(op, d.dealId)) * 100) / 100 : null,
      dealCurrId: d.currId,
      confirmed: d.confirmed,
      plAmt: d.plAmt,
      plCurr: d.plCurr,
      plRate: d.plRate,
      ndfDate: ndf?.ndfDate ?? '',
      bank: ndf?.bp ?? '',
      spot: !!data.spotDealIds[d.dealId],
      createdBy: d.createdBy,
      createdDate: d.createdDate,
      createdTime: d.createdTime,
      changedBy: d.changedBy,
      changedDate: d.changedDate,
      changedTime: d.changedTime,
    }
  })
}

/**
 * FORM send_email's decision per row: status 05 / 07; the model's sub type from RULE_BT
 * (WHERE zmod_id <> space, matched on the first 4 characters); FX1 -> the SET_TYP indicator row
 * of the full model id must carry ZHEAD_FX; FX2 -> the indicator row matched on the first 4
 * characters must carry ZHEAD_OPT. `indicators` holds SET_TYP WHERE zhead_fx <> space OR
 * zhead_opt <> space, so the first match is the first flagged row, as the ABAP ASSIGN finds it.
 */
export function mailPlanForRow(
  row: Pick<HeadsUpRow, 'status' | 'modelId'>,
  rules: readonly RuleBt[],
  indicators: readonly HeadsUpIndicator[],
): string[] {
  if (!ABAP.MAIL_STATUSES.includes(row.status)) return []
  const m4 = row.modelId.substring(0, 4)
  const type = rules.find((r) => r.id !== '' && r.id.substring(0, 4) === m4)
  if (!type) return []
  if (type.subType === ABAP.SUB_FX1) {
    const ind = indicators.find((i) => i.modelId === row.modelId)
    if (ind?.headFx) return ['Heads Up FX', 'Heads Up FX for DMCC']
  } else if (type.subType === ABAP.SUB_FX2) {
    const ind = indicators.find((i) => i.modelId.substring(0, 4) === m4)
    if (ind?.headOpt) return ['Heads Up Option', 'Heads Up Option for DMCC']
  }
  return []
}

export function buildMailPlan(
  rows: readonly Pick<HeadsUpRow, 'dealId' | 'status' | 'modelId'>[],
  rules: readonly RuleBt[],
  indicators: readonly HeadsUpIndicator[],
): MailPlan {
  const plan: MailPlan = { deals: [], mailCount: 0 }
  for (const r of rows) {
    const mails = mailPlanForRow(r, rules, indicators)
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
      : (error ?? 'No deal with status 05 / 07 and a heads-up indicator in the selection'),
  }
}

/** Hotspot ZMC_REF -> ZSGTSFFM_MC_DETAILS: the MC's ZSGTSFTR_MAS_CON row read by key, with its COMP entity. */
export function getMasterContract(data: Pick<ScreenData, 'masterContracts' | 'entities'>, ref: string): MasterContractDetail | null {
  const mc = data.masterContracts.find((m) => m.ref === ref)
  if (!mc) return null
  const entity = data.entities.find((e) => e.code === mc.origin)
  return {
    ref: mc.ref,
    origin: mc.origin,
    originName: entity?.name ?? '',
    region: entity?.regionId ?? '',
    modelId: mc.modelId,
    modelDesc: mc.modelDesc,
    currId: mc.currId,
    desc: mc.desc,
    commodity: mc.commodity,
    date: mc.date,
    amt: mc.amt,
  }
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
      // null: the amount has no source yet (utilization while ZSGTSFCDS_FX / _OPTION are not served).
      return v === '' || v === null ? '' : formatAmount(typeof v === 'number' ? v : 0)
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
