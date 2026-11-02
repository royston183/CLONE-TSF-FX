/**
 * The blotter's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 *
 * The original mutated module variables in place (the row list, the counters, each Master
 * Contract's utilisation, the business partner list). Here every operation takes the whole
 * Blotter and returns a new one; the few private helpers that still bump counters in place
 * only ever touch a copy made by the exported function calling them.
 */
import {
  ASSIGNMENTS,
  BUSINESS_AREAS,
  COMMODITIES,
  CURRENCY_PAIRS,
  ENTITIES,
  FIXING_REFERENCES,
  FX_MODELS,
  GROUPS,
  HOLIDAYS,
  INITIAL_COUNTERS,
  PORTFOLIOS,
  PROFIT_CENTERS,
  SPOT_COMPANY_CODES,
  SPOT_PARTNER_CODE,
  SPOT_TXN_TYPES,
  TRADERS,
  TRANSACTION_TYPES,
  entityOf,
  modelOf,
  pairOf,
  partnerOf,
  txnTypeOf,
} from './data.ts'
import { FX_TXN_STATUS, fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { addDays, fmtDate, fmtNum, parseAmount, parseGridDate, parseUiDate, RATE_DP, roundRate, toISO } from './format.ts'
import { parseUploadDate, uploadNumber, UPLOAD_COLUMNS } from './upload-schema.ts'
import type {
  AppDataPending,
  AutoLeg,
  AutoLegField,
  AutoSpotForm,
  Blotter,
  BlotterRow,
  BusinessPartner,
  Check,
  Counters,
  Ctx,
  DateField,
  DealRecord,
  Entity,
  Kpis,
  MasterContract,
  McSeed,
  Num,
  NumField,
  Option,
  RowStatus,
  Sort,
  StatusFilter,
  TextField,
  Trader,
  TxnListCriteria,
  UploadRow,
} from './types.ts'

/** A number cell as a number: a blank draft's '' reads as 0, as `(x || 0)` did. */
const num = (v: Num): number => (v === '' ? 0 : v)

// ---------------------------------------------------------------- calendar

export const isHoliday = (d: Date): boolean => HOLIDAYS.includes(toISO(d))
export const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

export function nextWorkingDay(d: Date): Date {
  let r = new Date(d)
  while (isWeekend(r) || isHoliday(r)) r = addDays(r, 1)
  return r
}

/** The date `n` working days before `d`: SAP's own default for an NDF's fixing date is two of them before the value date. */
export function workingDaysBack(d: Date, n: number): Date {
  let r = new Date(d)
  for (let left = n; left > 0; ) {
    r = addDays(r, -1)
    if (!isWeekend(r) && !isHoliday(r)) left--
  }
  return r
}

/** Working days after the earlier date up to and including the later one. */
export function workingDaysBetween(a: Date, b: Date): number {
  let n = 0
  let d = new Date(a < b ? a : b)
  const end = a < b ? b : a
  while (d < end) {
    d = addDays(d, 1)
    if (!isWeekend(d) && !isHoliday(d)) n++
  }
  return n
}

// ---------------------------------------------------------------- reference lookups / options

export const tradersOf = (group: string): Trader[] => TRADERS.filter((t) => t.group === group)
export const firstTraderOf = (group: string): string => tradersOf(group)[0]?.code ?? ''
export const mcBalance = (mc: MasterContract): number => mc.amtUSD - mc.utilizedUSD
export const findMc = (contracts: MasterContract[], mcNumber: string): MasterContract | undefined =>
  contracts.find((m) => m.mcNumber === mcNumber)
export const partnerLabel = (b: BusinessPartner): string => b.short || b.name
export const bsText = (v: string): string => (v === 'B' ? 'Buy' : 'Sell')

export const entityOptions = (): Option[] => ENTITIES.map((e) => ({ value: e.code, label: `${e.code} - ${e.name}` }))
export const bpOptions = (partners: BusinessPartner[]): Option[] =>
  partners.map((b) => ({ value: b.code, label: partnerLabel(b) }))
/** Each option leads with the SAP product type and transaction type it books as, e.g. "12B 619 - FWD - Outright Forward". */
export const txnTypeOptions = (): Option[] =>
  TRANSACTION_TYPES.map((t) => ({
    value: t.code,
    label: `${t.product ? `${t.product} ${t.sapType} - ` : ''}${t.code} - ${t.desc}`,
  }))
export const bsOptions = (): Option[] => [
  { value: 'B', label: 'Buy' },
  { value: 'S', label: 'Sell' },
]
export const currOptions = (): Option[] =>
  [...new Set(CURRENCY_PAIRS.flatMap((p) => [p.lead, p.follow]))].map((c) => ({ value: c, label: c }))
export const portfolioOptions = (): Option[] => PORTFOLIOS.map((p) => ({ value: p.code, label: p.desc }))
export const assignmentOptions = (): Option[] => ASSIGNMENTS.map((a) => ({ value: a.code, label: a.desc }))
export const profitCenterOptions = (): Option[] => PROFIT_CENTERS.map((p) => ({ value: p.code, label: p.label }))
export const businessAreaOptions = (): Option[] => BUSINESS_AREAS.map((b) => ({ value: b.code, label: b.label }))
/** Carries its own "Select ..." entry, so an empty NDF Fixing Ref cell shows two blank options. */
export const fixingRefOptions = (): Option[] => [
  { value: '', label: 'Select ...' },
  ...FIXING_REFERENCES.map((f) => ({ value: f.code, label: f.code })),
]
export const autoEntityOptions = (): Option[] =>
  ENTITIES.map((e) => ({ value: e.code, label: `${e.cocode} - ${e.code} - ${e.name}` }))
export const autoBpOptions = (partners: BusinessPartner[]): Option[] =>
  partners.map((b) => ({ value: b.code, label: `${partnerLabel(b)} - ${b.name}` }))

export const STATUS_LABEL: Record<RowStatus, string> = {
  DRAFT: 'Draft',
  CREATED: 'Created',
  RELEASED: 'Released',
  REVERSED: 'Reversed',
}
export const STATUS_CLASS: Record<RowStatus, string> = {
  DRAFT: 'st-draft',
  CREATED: 'st-created',
  RELEASED: 'st-released',
  REVERSED: 'st-reversed',
}

/** The reference a row goes by: its draft label until it has an RFHA. */
export const rowRef = (r: BlotterRow): string => (r.status === 'DRAFT' ? r.draftLabel : r.transactionNumber)

// ---------------------------------------------------------------- master contracts

export function buildMasterContracts(today: Date, seed: McSeed[]): MasterContract[] {
  return seed.map((s) => {
    const m = modelOf(s.model)
    const shipStart = addDays(today, s.shipStartOff)
    return {
      mcNumber: s.n,
      // The old seed list had no origin of its own: its first entity stood for it.
      origin: m?.entities[0] ?? '',
      fxModel: s.model,
      modelDesc: m?.desc ?? '',
      entities: m?.entities ?? [],
      currPair: m?.pair ?? '',
      commodityCode: s.comm,
      commodityDesc: COMMODITIES.find((c) => c.code === s.comm)?.desc ?? '',
      mcDate: today,
      shipStart,
      shipEnd: addDays(shipStart, s.shipDur),
      amtUSD: s.amtUSD,
      utilizedUSD: 0,
      group: s.group,
      portShipment: 'Any port(s) of origin',
      portDestination: 'Any port(s) of destination',
    }
  })
}

const drawDown = (contracts: MasterContract[], mcNumber: string, delta: number): MasterContract[] =>
  contracts.map((mc) => (mc.mcNumber === mcNumber ? { ...mc, utilizedUSD: Math.max(0, mc.utilizedUSD + delta) } : mc))

// ---------------------------------------------------------------- rows

/** Amount 2, spot, profit centre / Unit(BA) defaults and the NDF fields, from the rest of the row. */
export function recalcRow(input: BlotterRow): BlotterRow {
  const row = { ...input }
  const ent = entityOf(row.entity)
  const tt = txnTypeOf(row.txnType)
  // Lead / follow and the currency pair (ZSGTRMFM_LEAD_CURR equivalent).
  const candidatePair = `${row.curr1}/${row.curr2}`
  const p =
    pairOf(candidatePair) ??
    pairOf(row.curr1 === 'USD' ? `USD/${row.curr2}` : `${row.curr2}/${row.curr1}`) ??
    (pairOf('USD/INR') as NonNullable<ReturnType<typeof pairOf>>)
  if (!row.curr2) row.curr2 = p.follow === row.curr1 ? p.lead : p.follow
  // Amount 2 = Amount 1 × Total Rate / quotePer (IDR / KWA / VND / TWD are quoted per 100).
  row.amt2 = (num(row.amt1) * num(row.totalRate)) / (p.quotePer || 1)
  // Spot = total rate less swap points (points in local pips / 100) for the forward types.
  row.spotRate =
    tt && (tt.code === 'FWD' || tt.ndf || tt.code === 'SWAP')
      ? roundRate(num(row.totalRate) - num(row.swapPoints) / 100)
      : row.totalRate
  if (!row.profitCenter) row.profitCenter = ent ? ent.defaultProfitCenter : ''
  if (!row.businessArea) row.businessArea = ent ? ent.businessArea : ''
  if (!row.buySell2) row.buySell2 = row.buySell === 'B' ? 'S' : 'B'
  // The NDF fixing fields only apply to NDF / DNDF.
  if (!tt?.ndf) {
    row.ndfRef = ''
    row.ndfDate = null
  } else if (!row.ndfRef) {
    row.ndfRef = (FIXING_REFERENCES.find((f) => f.pair === candidatePair) ?? FIXING_REFERENCES[0])?.code ?? ''
  }
  return row
}

const draftLabel = (c: Counters): string => `DRAFT-${String(c.draft++).padStart(3, '0')}`

/** An empty draft row; bumps `c`, which must be the caller's own copy. */
function newBlankRow(c: Counters, group: string, trader: string): BlotterRow {
  const seq = c.seq++
  return {
    id: `R${seq}`,
    seq,
    status: 'DRAFT',
    draftLabel: draftLabel(c),
    transactionNumber: '',
    group,
    trader,
    tradeDate: null,
    entity: '',
    bp: '',
    txnType: '',
    buySell: '',
    buySell2: '',
    curr1: '',
    amt1: '',
    curr2: '',
    amt2: '',
    spotRate: '',
    swapPoints: '',
    totalRate: '',
    valueDate: null,
    ndfDate: null,
    ndfRef: '',
    portfolio: '',
    assignment: '',
    profitCenter: '',
    businessArea: '',
    mcRef: '',
    dealId: '',
    dealType: '',
    fxModel: '',
    notes: '',
  }
}

export type RowOpts = {
  status?: RowStatus
  entity?: string
  bp?: string
  txnType?: string
  buySell?: string
  buySell2?: string
  curr1?: string
  amt1?: Num
  valueDateOffsetDays?: number
  portfolio?: string
  assignment?: string
  model?: string
  group?: string
  trader?: string
  mcRef?: string
  dealId?: string
  dealType?: string
  tradeDate?: Date | null
}

/** The original's makeRow: a filled row with defaults; bumps `c`, the caller's own copy. */
function makeRow(c: Counters, ctx: Ctx, opts: RowOpts): BlotterRow {
  const tt = opts.txnType ? txnTypeOf(opts.txnType) : null
  const m = opts.model ? modelOf(opts.model) : null
  const pairCode = m ? m.pair : 'USD/INR'
  const pair = pairOf(pairCode) ?? CURRENCY_PAIRS[0]!
  const status = opts.status || 'DRAFT'
  const buySell = opts.buySell || 'B'
  const seq = c.seq++
  return recalcRow({
    id: `R${seq}`,
    seq,
    status,
    draftLabel: status === 'DRAFT' ? draftLabel(c) : '',
    transactionNumber: status !== 'DRAFT' ? String(c.rfha++) : '',
    group: opts.group || ctx.group || GROUPS[0]!.code,
    trader: opts.trader || ctx.trader || '',
    tradeDate: opts.tradeDate ? new Date(opts.tradeDate) : new Date(ctx.date),
    entity: opts.entity || 'OGA',
    bp: opts.bp || 'BP1001',
    txnType: opts.txnType || 'SPOT',
    buySell,
    buySell2: opts.buySell2 || (buySell === 'B' ? 'S' : 'B'),
    curr1: opts.curr1 || pair.lead,
    amt1: opts.amt1 || 100000,
    curr2: pair.follow,
    amt2: 0,
    spotRate: 0,
    swapPoints: 0,
    totalRate: pair.baseRate,
    valueDate: nextWorkingDay(addDays(ctx.date, opts.valueDateOffsetDays ?? (tt ? tt.valueDateOffset : 2))),
    ndfDate: null,
    ndfRef: tt?.ndf ? ((FIXING_REFERENCES.find((f) => f.pair === pairCode) ?? FIXING_REFERENCES[0])?.code ?? '') : '',
    portfolio: opts.portfolio || 'TRADING',
    assignment: opts.assignment || '360T',
    profitCenter: '',
    businessArea: '',
    mcRef: opts.mcRef || '',
    dealId: opts.dealId || '',
    dealType: opts.dealType || '',
    fxModel: opts.model || '',
    notes: '',
  })
}

const has = (v: unknown): boolean => !(v === undefined || v === null || v === '')

const BLANK_CHECK_FIELDS = [
  'tradeDate',
  'entity',
  'bp',
  'txnType',
  'buySell',
  'buySell2',
  'curr1',
  'amt1',
  'curr2',
  'totalRate',
  'swapPoints',
  'valueDate',
  'assignment',
  'portfolio',
  'profitCenter',
  'businessArea',
  'ndfDate',
  'ndfRef',
  'notes',
] as const satisfies ReadonlyArray<keyof BlotterRow>

/** A draft nobody has typed into yet: the grid always keeps ten of these at the bottom. */
export function isCompletelyBlankDraft(r: BlotterRow | undefined): boolean {
  if (!r || r.status !== 'DRAFT') return false
  return !BLANK_CHECK_FIELDS.some((f) => has(r[f]))
}

export const hasDraftValue = has

// ---------------------------------------------------------------- blotter lifecycle

/**
 * What the original's applyFilters() did to the data on every change: top the grid back up to
 * ten empty draft rows and forget checked rows that no longer exist.
 */
export function settle(b: Blotter): Blotter {
  let rows = b.rows
  let counters = b.counters
  let blank = rows.filter(isCompletelyBlankDraft).length
  if (blank < 10) {
    const c = { ...counters }
    rows = [...rows]
    while (blank < 10) {
      rows.push(newBlankRow(c, b.ctx.group, b.ctx.trader))
      blank++
    }
    counters = c
  }
  const ids = new Set(rows.map((r) => r.id))
  const checked = b.checked.filter((id) => ids.has(id))
  return rows === b.rows && checked.length === b.checked.length ? b : { ...b, rows, counters, checked }
}

/**
 * Load Blotter: ten empty draft rows for the selected group / trader. The original also laid out two example Created
 * legs (the demo's OGA / DMCC pair, RFHA 8100001...); the screen no longer shows them, since every real transaction
 * comes from SAP. `demoLegs` brings them back for the tests that need example data to work on.
 */
export function loadContext(b: Blotter, opts: { demoLegs?: boolean } = {}): { blotter: Blotter; loaded: number } {
  const c = { ...b.counters }
  const { group, trader } = b.ctx
  // The two seeded legs belong to the OGA-DMCC model; the first loaded model with that start stands in for it.
  const seedModel = FX_MODELS.find((m) => m.entities[0] === 'OGA' && m.entities[1] === 'DMCC')?.code ?? ''
  const seeded: RowOpts = {
    status: 'CREATED',
    txnType: 'FWD',
    curr1: 'USD',
    amt1: 2500000,
    portfolio: 'TRADING',
    model: seedModel,
    group,
    trader,
  }
  const existing = opts.demoLegs
    ? [
        makeRow(c, b.ctx, { ...seeded, entity: 'OGA', bp: 'BP1005', buySell: 'S', valueDateOffsetDays: 32 }),
        makeRow(c, b.ctx, { ...seeded, entity: 'DMCC', bp: 'BP1006', buySell: 'B', valueDateOffsetDays: 33 }),
      ]
    : []
  const blanks = Array.from({ length: 10 }, () => newBlankRow(c, group, trader))
  return {
    blotter: settle({ ...b, rows: [...existing, ...blanks], counters: c, checked: [] }),
    loaded: existing.length,
  }
}

const freshCtx = (now: Date): Ctx => {
  const group = GROUPS[0]!.code
  return { date: new Date(now), group, trader: firstTraderOf(group) }
}

/** The page as it first opens: the first group and trader, loaded. */
export function initialBlotter(now: Date, contracts: MasterContract[], partners: BusinessPartner[], opts: { demoLegs?: boolean } = {}): Blotter {
  return loadContext(
    {
      rows: [],
      contracts,
      deals: [],
      partners,
      counters: { ...INITIAL_COUNTERS },
      ctx: freshCtx(now),
      checked: [],
      locked: false,
    },
    opts,
  ).blotter
}

/**
 * Refresh: counters, Deal IDs and MC utilisation back to the start, then a fresh load. Like
 * the original it leaves alone the partners Upload added and the Master Contracts' dates.
 */
export function hardReset(b: Blotter, now: Date): Blotter {
  return initialBlotter(
    now,
    b.contracts.map((mc) => ({ ...mc, utilizedUSD: mc.baseUtilizedUSD ?? 0 })),
    b.partners,
  )
}

export const setCtx = (b: Blotter, patch: Partial<Ctx>): Blotter => ({ ...b, ctx: { ...b.ctx, ...patch } })

/** The Group dropdown refills the traders, and the first of them becomes the selection. */
export const changeGroup = (b: Blotter, group: string): Blotter => setCtx(b, { group, trader: firstTraderOf(group) })

// ---------------------------------------------------------------- overview / filter / sort

export function computeKpis(rows: BlotterRow[]): Kpis {
  const counts: Record<RowStatus, number> = { DRAFT: 0, CREATED: 0, RELEASED: 0, REVERSED: 0 }
  let notional = 0
  for (const r of rows) {
    counts[r.status]++
    // The original summed with +=, so a blank row's '' turned the total into a string.
    if (r.status !== 'REVERSED') notional += num(r.amt1)
  }
  return { total: rows.length, counts, notional }
}

/** Everything the search box matches against, as the grid and its lookups show it. */
export function rowSearchHay(r: BlotterRow, partners: BusinessPartner[]): string {
  const tt = txnTypeOf(r.txnType)
  const ent = entityOf(r.entity)
  const bp = partnerOf(partners, r.bp)
  return [
    r.status,
    r.draftLabel,
    r.transactionNumber,
    fmtDate(r.tradeDate),
    r.group,
    r.trader,
    r.entity,
    ent ? ent.name : '',
    bp ? partnerLabel(bp) : '',
    r.txnType,
    tt ? tt.desc : '',
    r.buySell,
    r.buySell2,
    r.curr1,
    r.curr2,
    fmtNum(r.amt1),
    fmtNum(r.amt2),
    fmtNum(r.spotRate, RATE_DP),
    r.swapPoints,
    fmtNum(r.totalRate, RATE_DP),
    fmtDate(r.valueDate),
    r.assignment,
    r.portfolio,
    r.profitCenter,
    r.businessArea,
    r.ndfDate ? fmtDate(r.ndfDate) : '',
    r.ndfRef,
    r.mcRef,
    r.dealId,
    r.dealType,
    r.notes,
  ]
    .join(' ')
    .toLowerCase()
}

export function filterRows(
  rows: BlotterRow[],
  partners: BusinessPartner[],
  status: StatusFilter,
  search: string,
): BlotterRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((r) => {
    if (status !== 'ALL' && r.status !== status) return false
    return !q || rowSearchHay(r, partners).includes(q)
  })
}

function sortValue(r: BlotterRow, key: Sort['key']): number | string {
  const v = r[key]
  if (v instanceof Date) return v.getTime()
  // The original threw on a draft without a date; an undated row sorts as the earliest.
  if (v === null) return Number.NEGATIVE_INFINITY
  return typeof v === 'string' ? v.toLowerCase() : v
}

/**
 * Created / Released / Reversed rows first, then drafts being worked on, then the empty rows;
 * the chosen column orders rows within each block.
 */
export function sortRows(rows: BlotterRow[], sort: Sort): BlotterRow[] {
  return groupDealLegs([...rows].sort((a, b) => {
    const aDraft = a.status === 'DRAFT' ? 1 : 0
    const bDraft = b.status === 'DRAFT' ? 1 : 0
    if (aDraft !== bDraft) return aDraft - bDraft
    if (aDraft && bDraft) {
      const aBlank = isCompletelyBlankDraft(a) ? 1 : 0
      const bBlank = isCompletelyBlankDraft(b) ? 1 : 0
      if (aBlank !== bBlank) return aBlank - bBlank
    }
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -sort.dir
    if (av > bv) return sort.dir
    return 0
  }))
}

/** The leg number a deal type names: D1 / Deal 1 -> 1, D2 / Deal 2 -> 2; anything else (a Short Straddle, SAP's text) has none. */
const legNumber = (r: BlotterRow): number => Number(/^(?:D|Deal )([0-9])[^0-9]/.exec(`${r.dealType} `)?.[1] ?? 99)

/**
 * The legs of one Deal ID sit next to each other: each deal appears where its first row was sorted, with its other legs
 * directly below it, Deal 1 above Deal 2. A row with no Deal ID (and every draft) keeps its place.
 */
export function groupDealLegs(rows: BlotterRow[]): BlotterRow[] {
  const out: BlotterRow[] = []
  const placed = new Set<string>()
  for (const r of rows) {
    if (!r.dealId || r.status === 'DRAFT') {
      out.push(r)
      continue
    }
    if (placed.has(r.dealId)) continue
    placed.add(r.dealId)
    const legs = rows.filter((x) => x.dealId === r.dealId && x.status !== 'DRAFT')
    out.push(...legs.map((x, i) => ({ x, i })).sort((a, b) => legNumber(a.x) - legNumber(b.x) || a.i - b.i).map(({ x }) => x))
  }
  return out
}

/** Header clicks: the same column flips direction, a new one starts ascending. */
export const nextSort = (s: Sort, key: Sort['key']): Sort =>
  s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }

/** "2 transactions | 1 draft | 10 empty" over the rows the filters let through. */
export function resultBadge(rows: BlotterRow[]): string {
  const tx = rows.filter((r) => r.status !== 'DRAFT').length
  const blank = rows.filter(isCompletelyBlankDraft).length
  const working = rows.filter((r) => r.status === 'DRAFT' && !isCompletelyBlankDraft(r)).length
  return `${tx} transaction${tx === 1 ? '' : 's'}${working ? ` | ${working} draft` : ''}${blank ? ` | ${blank} empty` : ''}`
}

/** Up to two page buttons either side of the current one. */
export function pagerWindow(page: number, totalPages: number): number[] {
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i)
}

// ---------------------------------------------------------------- selection / toolbar

export const checkedRows = (b: Blotter): BlotterRow[] =>
  b.checked.map((id) => b.rows.find((r) => r.id === id)).filter((r): r is BlotterRow => !!r)

export const toggleChecked = (checked: string[], id: string, on: boolean): string[] =>
  on ? (checked.includes(id) ? checked : [...checked, id]) : checked.filter((x) => x !== id)

/** Which toolbar buttons the current selection enables. */
export function toolbarState(sel: BlotterRow[], locked: boolean) {
  const n = sel.length
  const first = sel[0]
  const allDraft = n >= 1 && sel.every((r) => r.status === 'DRAFT')
  return {
    copy: n === 1 && !locked,
    del: !locked && allDraft,
    reverse: !locked && n === 1 && (first?.status === 'CREATED' || first?.status === 'RELEASED'),
    // ZSGSLCFM_DISPLAY needs a company code and an existing RFHA.
    view: n === 1 && !!first?.transactionNumber && first.status !== 'DRAFT',
    create: !locked && allDraft,
    release: !locked && n >= 1 && n <= 2 && sel.every((r) => r.status === 'CREATED'),
    ss: !locked && n === 2 && sel.every((r) => r.status === 'CREATED' && !!modelOf(r.fxModel)?.ssEligible),
    insert: !locked,
    auto: !locked,
  }
}

// ---------------------------------------------------------------- grid edits

const replaceRow = (b: Blotter, row: BlotterRow): Blotter => ({
  ...b,
  rows: b.rows.map((r) => (r.id === row.id ? row : r)),
})

/** A select or number cell changed; only drafts can be edited. */
export function editField(b: Blotter, id: string, field: TextField | NumField, value: string): Blotter {
  const found = b.rows.find((r) => r.id === id)
  if (!found || found.status !== 'DRAFT') return b
  const row = { ...found }
  if (field === 'amt1' || field === 'swapPoints' || field === 'totalRate') {
    const n = parseAmount(value)
    row[field] = Number.isNaN(n) ? 0 : field === 'totalRate' ? roundRate(n) : n
  } else {
    row[field] = value
  }
  if (field === 'entity') {
    row.profitCenter = ''
    row.businessArea = ''
  }
  if (field === 'buySell') row.buySell2 = value === 'B' ? 'S' : 'B'
  if (field === 'curr1') {
    const p = CURRENCY_PAIRS.find((cp) => cp.lead === value)
    if (p) {
      row.curr2 = p.follow
      row.totalRate = p.baseRate
    }
  }
  if (field === 'txnType') {
    const tt = txnTypeOf(value)
    // An undated draft counts from new Date(null), 01-01-1970, as it did.
    if (tt) row.valueDate = nextWorkingDay(addDays(row.tradeDate ?? new Date(0), tt.valueDateOffset))
    if (!tt?.ndf) {
      row.ndfDate = null
      row.ndfRef = ''
    }
  }
  return replaceRow(b, recalcRow(row))
}

/** A date cell changed; anything but DD-MM-YYYY is ignored and the cell shows the old date. */
export function editDate(b: Blotter, id: string, field: DateField, value: string): Blotter {
  const found = b.rows.find((r) => r.id === id)
  if (!found || found.status !== 'DRAFT') return b
  const d = parseGridDate(value)
  return d ? replaceRow(b, { ...found, [field]: d }) : b
}

export function saveNote(b: Blotter, id: string, text: string): Blotter {
  const found = b.rows.find((r) => r.id === id)
  return found ? replaceRow(b, { ...found, notes: text.trim() }) : b
}

// ---------------------------------------------------------------- insert / copy / delete / reverse / create

export function insertRow(b: Blotter): Blotter {
  const c = { ...b.counters }
  return { ...b, rows: [...b.rows, newBlankRow(c, b.ctx.group, b.ctx.trader)], counters: c }
}

/** Copy: a new draft at the top with the trade fields; generated / status fields are cleared. */
export function copyRow(b: Blotter, id: string): Blotter {
  const src = b.rows.find((r) => r.id === id)
  if (!src) return b
  const c = { ...b.counters }
  const copy = makeRow(c, b.ctx, {
    status: 'DRAFT',
    entity: src.entity,
    bp: src.bp,
    txnType: src.txnType,
    buySell: src.buySell,
    buySell2: src.buySell2,
    curr1: src.curr1,
    amt1: src.amt1,
    portfolio: src.portfolio,
    assignment: src.assignment,
  })
  const row = recalcRow({
    ...copy,
    curr2: src.curr2,
    swapPoints: src.swapPoints,
    totalRate: src.totalRate,
    profitCenter: src.profitCenter,
    businessArea: src.businessArea,
    ndfDate: src.ndfDate,
    ndfRef: src.ndfRef,
  })
  return { ...b, rows: [row, ...b.rows], counters: c, checked: [] }
}

/** Deletes the given rows that are still drafts; returns how many went. */
export function deleteDrafts(b: Blotter, ids: string[]): { blotter: Blotter; deleted: number } {
  const drop = new Set(b.rows.filter((r) => ids.includes(r.id) && r.status === 'DRAFT').map((r) => r.id))
  return {
    blotter: { ...b, rows: b.rows.filter((r) => !drop.has(r.id)), checked: b.checked.filter((id) => !drop.has(id)) },
    deleted: drop.size,
  }
}

export const canReverse = (r: BlotterRow | undefined): boolean => r?.status === 'CREATED' || r?.status === 'RELEASED'

/**
 * Marks rows as owing, or no longer owing, an application-data save (ZSGTSFTR_APP_STR). A row that has saved
 * takes the TXN_STATUS written for it, so the grid and the stored status agree.
 */
export function setAppDataPending(
  b: Blotter,
  changes: ReadonlyMap<string, { pending?: AppDataPending; txnStatus?: string }>,
): Blotter {
  if (!changes.size) return b
  return {
    ...b,
    rows: b.rows.map((r) => {
      const c = changes.get(r.id)
      if (!c) return r
      const { appDataPending: _owed, ...rest } = r
      return { ...rest, ...(c.pending ? { appDataPending: c.pending } : {}), ...(c.txnStatus ? { txnStatus: c.txnStatus } : {}) }
    }),
  }
}

/** Reverse: the row turns Reversed and gives back whatever it drew on its Master Contract. */
export function reverseTxn(b: Blotter, id: string): Blotter {
  const row = b.rows.find((r) => r.id === id)
  if (!row || !canReverse(row)) return b
  return {
    ...replaceRow(b, { ...row, status: 'REVERSED' }),
    checked: b.checked.filter((x) => x !== id),
    contracts: row.mcRef ? drawDown(b.contracts, row.mcRef, -num(row.amt1)) : b.contracts,
  }
}

/** Create Transaction's checks; the toast shows the first. */
export function validateCreate(sel: BlotterRow[]): string[] {
  const errs: string[] = []
  for (const r of sel) {
    if (!r.amt1 || r.amt1 <= 0) errs.push(`${r.draftLabel}: Amount 1 must be greater than zero.`)
    if (!r.totalRate || r.totalRate <= 0) errs.push(`${r.draftLabel}: Total Rate must be greater than zero.`)
    // The original threw here on a draft with no value date, so Create did nothing at all.
    if (!r.valueDate) errs.push(`${r.draftLabel}: Value Date is required.`)
    else if (isWeekend(r.valueDate) || isHoliday(r.valueDate))
      errs.push(`${r.draftLabel}: Value date ${fmtDate(r.valueDate)} falls on a non-working day.`)
  }
  return errs
}

/** Each draft gets the next mock RFHA, in the order the rows were checked. */
export function createDrafts(b: Blotter, ids: string[]): Blotter {
  const c = { ...b.counters }
  const byId = new Map(b.rows.map((r) => [r.id, r]))
  const updated = new Map<string, BlotterRow>()
  for (const id of ids) {
    const r = byId.get(id)
    if (r?.status === 'DRAFT')
      updated.set(id, { ...r, status: 'CREATED', transactionNumber: String(c.rfha++), draftLabel: '' })
  }
  return {
    ...b,
    rows: b.rows.map((r) => updated.get(r.id) ?? r),
    counters: c,
    checked: b.checked.filter((id) => !updated.has(id)),
  }
}

/** SAP's answer to Create for the rows it accepted: they take the real transaction number. */
export function applyCreated(
  b: Blotter,
  created: Map<string, { companyCode: string; transaction: string; appDataPending?: AppDataPending }>,
): Blotter {
  return {
    ...b,
    rows: b.rows.map((r) => {
      const c = created.get(r.id)
      if (!c) return r
      return {
        ...r,
        status: 'CREATED',
        transactionNumber: c.transaction,
        companyCode: c.companyCode,
        live: true,
        draftLabel: '',
        // 01 once the application data is saved; until then the row owes that save.
        ...(c.appDataPending ? { appDataPending: c.appDataPending } : { txnStatus: FX_TXN_STATUS.FO_CREATE }),
      }
    }),
    checked: b.checked.filter((id) => !created.has(id)),
  }
}

/**
 * Puts the deals read from SAP on the grid. A deal already shown (created in this session, or
 * read by an earlier load) is kept as it is, not listed twice: SAP knows nothing of its Deal ID,
 * Master Contract or release, which live only on this screen. The one thing SAP decides is a
 * reversal, so that is applied to the row already there.
 */
export function mergeLiveRows(
  b: Blotter,
  incoming: Array<Omit<BlotterRow, 'id' | 'seq'>>,
  partners: BusinessPartner[],
): Blotter {
  const key = (r: { companyCode?: string | undefined; transactionNumber: string }) =>
    `${r.companyCode ?? ''}/${r.transactionNumber}`
  const shown = new Map(b.rows.filter((r) => r.live).map((r) => [key(r), r]))
  const reversed = new Set(incoming.filter((r) => r.status === 'REVERSED').map(key))
  const incomingByKey = new Map(incoming.map((r) => [key(r), r]))
  const c = { ...b.counters }
  const added = incoming
    .filter((r) => !shown.has(key(r)))
    .map((r) => {
      const seq = c.seq++
      return { ...r, id: `R${seq}`, seq } as BlotterRow
    })
  const existing = b.rows.map((r) => {
    if (!r.live) return r
    let next = r
    if (reversed.has(key(r)) && r.status !== 'REVERSED') next = { ...next, status: 'REVERSED' as const }
    // A Deal ID created since the row was loaded (by another screen, or just now): SAP's word on it wins.
    const inc = incomingByKey.get(key(r))
    // The stored TXN_STATUS says how far the deal has got, e.g. released by another user or session since this
    // row was loaded. It only moves a row forwards (Created -> Released), and not while this session still owes
    // the save, so a status is never taken back.
    if (inc?.txnStatus && !r.appDataPending) next = { ...next, txnStatus: inc.txnStatus }
    if (inc?.status === 'RELEASED' && next.status === 'CREATED' && !r.appDataPending) next = { ...next, status: 'RELEASED' }
    if (inc?.dealId && !r.dealId) next = { ...next, dealId: inc.dealId, mcRef: inc.mcRef, fxModel: inc.fxModel, dealType: inc.dealType }
    return next
  })
  return settle({ ...b, partners, rows: [...added, ...existing], counters: c })
}

// ---------------------------------------------------------------- release to MO

/** Auto Deal legs already carry their MC and Deal ID, so Release only changes the status. */
export const isPreassigned = (sel: BlotterRow[]): boolean => sel.every((r) => !!(r.dealId && r.mcRef))

const RELEASE_TYPES = ['SPOT', 'TOM', 'FWD', 'SWAP', 'NDF', 'DNDF']

export function releaseRows(b: Blotter, ids: string[]): Blotter {
  return {
    ...b,
    rows: b.rows.map((r) => (ids.includes(r.id) ? { ...r, status: 'RELEASED' } : r)),
    checked: b.checked.filter((id) => !ids.includes(id)),
  }
}

/** Screens 9004 / 9005: the Deal IDs a single leg may join. */
export const openDealsFor = (row: BlotterRow, deals: DealRecord[]): DealRecord[] =>
  deals.filter((d) => d.type !== 'REVERSED' && RELEASE_TYPES.includes(row.txnType))

export function assignCheck(row: BlotterRow, deal: DealRecord, contracts: MasterContract[]): Check {
  const mc = findMc(contracts, deal.mcNumber)
  const msgs: string[] = []
  if (mc) {
    const vd = row.valueDate
    if (!vd || vd < mc.shipStart || vd > addDays(mc.shipEnd, 30))
      msgs.push(
        `Value date ${fmtDate(vd)} is outside the Master Contract's shipping window (${fmtDate(mc.shipStart)} – ${fmtDate(mc.shipEnd)}).`,
      )
    if (num(row.amt1) > mcBalance(mc) * 1.05)
      msgs.push("Amount exceeds the Master Contract's remaining balance plus tolerance.")
  }
  return { ok: msgs.length === 0, msgs }
}

export function assignToDeal(b: Blotter, rowId: string, dealId: string): Blotter {
  const row = b.rows.find((r) => r.id === rowId)
  const deal = b.deals.find((d) => d.dealId === dealId)
  if (!row || !deal) return b
  const released: BlotterRow = {
    ...row,
    status: 'RELEASED',
    mcRef: deal.mcNumber,
    dealId: deal.dealId,
    dealType: deal.type,
    fxModel: deal.model,
  }
  return {
    ...replaceRow(b, released),
    deals: b.deals.map((d) => (d === deal ? { ...d, legs: [...d.legs, row.id] } : d)),
    checked: b.checked.filter((x) => x !== rowId),
    contracts: findMc(b.contracts, deal.mcNumber) ? drawDown(b.contracts, deal.mcNumber, num(row.amt1)) : b.contracts,
  }
}

/** Screen 9003's D1 / D2 matching: opposite sides, same pair, value dates close together. */
export function pairCheck(a: BlotterRow, b: BlotterRow): Check {
  const msgs: string[] = []
  if (a.buySell === b.buySell)
    msgs.push(
      'Both legs are on the same side (Buy/Buy or Sell/Sell) — a valid D1/D2 pair must be opposite sides of the same currency pair.',
    )
  if (a.curr1 !== b.curr1 || a.curr2 !== b.curr2) msgs.push('Currency pairs do not match between the two legs.')
  const gap = Math.abs(Math.round(((a.valueDate?.getTime() ?? 0) - (b.valueDate?.getTime() ?? 0)) / 86400000))
  if (gap > 5) msgs.push(`Value dates are ${gap} calendar day(s) apart, outside the standard ±5 working-day tolerance.`)
  return { ok: msgs.length === 0, msgs }
}

/** Master Contracts on D1's currency pair whose Entity String includes D1's entity. */
export const mcCandidates = (a: BlotterRow, contracts: MasterContract[]): MasterContract[] =>
  contracts.filter((mc) => mc.currPair === `${a.curr1}/${a.curr2}` && mc.entities.includes(a.entity))

/** A failed pair check blocks the button without adding a line of its own here, as before. */
export function toleranceCheck(a: BlotterRow, mc: MasterContract, pairOk: boolean): Check {
  const m = modelOf(mc.fxModel)
  const tolPct = m?.tolerancePct ?? 5
  const msgs: string[] = []
  // The legacy AMT_CHECK: balance plus the tolerance percent of the balance (not of the contract amount).
  if (num(a.amt1) > mcBalance(mc) * (1 + tolPct / 100))
    msgs.push(`Leg amount ${fmtNum(a.amt1)} exceeds MC balance (${fmtNum(mcBalance(mc))}) plus ${tolPct}% tolerance.`)
  const vd = a.valueDate
  if (!vd || vd < mc.shipStart || vd > addDays(mc.shipEnd, m?.valueDateToleranceDays ?? 5))
    msgs.push("Value date falls outside the MC's shipping window (with tolerance).")
  return { ok: msgs.length === 0 && pairOk, msgs }
}

/** Generate Deal ID & Release: both legs join a new PAIR Deal ID; D1's amount draws the MC. */
export function assignMc(
  b: Blotter,
  aId: string,
  bId: string,
  mcNumber: string,
  givenDealId?: string,
): { blotter: Blotter; dealId: string } | null {
  const a = b.rows.find((r) => r.id === aId)
  const bb = b.rows.find((r) => r.id === bId)
  const mc = findMc(b.contracts, mcNumber)
  if (!a || !bb || !mc) return null
  const c = { ...b.counters }
  // The screen passes the Deal ID SAP issued; only the demo path (tests) still counts up its own.
  const dealId = givenDealId ?? `TSF-${c.dealId++}`
  const legs = new Map([a, bb].map((r, i) => [r.id, i]))
  return {
    dealId,
    blotter: {
      ...b,
      counters: c,
      rows: b.rows.map((r) => {
        const i = legs.get(r.id)
        return i === undefined
          ? r
          : {
              ...r,
              status: 'RELEASED',
              mcRef: mc.mcNumber,
              dealId,
              dealType: `D${i + 1} (Paired Model)`,
              fxModel: mc.fxModel,
            }
      }),
      checked: b.checked.filter((id) => !legs.has(id)),
      contracts: drawDown(b.contracts, mc.mcNumber, num(a.amt1)),
      deals: [
        ...b.deals,
        {
          dealId,
          mcNumber: mc.mcNumber,
          model: mc.fxModel,
          type: 'PAIR',
          legs: [a.id, bb.id],
          createdOn: new Date(b.ctx.date),
        },
      ],
    },
  }
}

// ---------------------------------------------------------------- auto deal creation (screen 9006)

/** Origin entities (first of the Entity String) of every Master Contract with balance left. */
export function autoOrigins(): string[] {
  return ENTITIES.filter((e) => e.origin).map((e) => e.code)
}

export const autoEligible = (contracts: MasterContract[], origin: string): MasterContract[] =>
  contracts.filter((mc) => mcBalance(mc) > 0 && mc.origin === origin)

/** Amount 2 and spot from the rate, amount and swap; NDF legs get a fixing date two days before value. */
export function recalcAutoLeg(input: AutoLeg): AutoLeg {
  const l = { ...input }
  const p = pairOf(`${l.curr1}/${l.curr2}`) ?? pairOf(`${l.curr2}/${l.curr1}`)
  const quotePer = p ? p.quotePer || 1 : 1
  const lead = p ? p.lead : l.curr1
  const rate = l.rate || 0
  const amt = l.amt1 || 0
  if (rate > 0) l.amt2 = l.curr1 === lead ? (amt * rate) / quotePer : (amt * quotePer) / rate
  else l.amt2 = 0
  l.spot = roundRate(rate - (l.swap || 0))
  if (!txnTypeOf(l.txnType)?.ndf) {
    l.fixingDate = null
    l.fixRef = ''
  } else if (!l.fixingDate && l.valueDate) {
    l.fixingDate = workingDaysBack(l.valueDate, 2)
  }
  return l
}

/**
 * Deal 1 / Deal 2 from the MC's model. The rates are left for the trader to enter: there is no rate source to fill them
 * from, and a made-up base rate would be booked in SAP as typed.
 */
export function initAutoLegs(mc: MasterContract, ctxDate: Date): AutoLeg[] {
  const m = modelOf(mc.fxModel)
  const p = pairOf(mc.currPair)
  if (!m || !p) return []
  const amt = Math.min(mcBalance(mc), mc.amtUSD * 0.4)
  const valueDate = nextWorkingDay(addDays(ctxDate, 32))
  const base = {
    // The legs are booked in SAP, where only a real partner number is accepted.
    partner: SPOT_PARTNER_CODE,
    curr1: p.lead,
    curr2: p.follow,
    amt1: amt,
    amt2: 0,
    swap: 0,
    mode: '360T',
    fixingDate: null,
    fixRef: '',
  }
  return [
    recalcAutoLeg({
      ...base,
      leg: 'Deal 1',
      tradeDate: new Date(ctxDate),
      valueDate: new Date(valueDate),
      entity: m.d1.from,
      txnType: m.d1.txnType ?? 'FWD',
      bs: m.d1.bs1,
      bs2: m.d1.bs2,
      rate: 0,
      spot: 0,
    }),
    recalcAutoLeg({
      ...base,
      leg: 'Deal 2',
      tradeDate: new Date(ctxDate),
      valueDate: addDays(valueDate, 1),
      entity: m.d2.from,
      txnType: m.d2.txnType ?? 'FWD',
      bs: m.d2.bs1,
      bs2: m.d2.bs2,
      rate: 0,
      spot: 0,
    }),
  ]
}

const AUTO_RECALC: AutoLegField[] = ['amt1', 'rate', 'swap', 'valueDate']

/** One editable leg field changed; an unreadable date is ignored, an unreadable number is 0. */
export function updateAutoLeg(legs: AutoLeg[], index: number, field: AutoLegField, value: string): AutoLeg[] {
  const found = legs[index]
  if (!found) return legs
  let l: AutoLeg = { ...found }
  if (field === 'tradeDate' || field === 'valueDate' || field === 'fixingDate') {
    const d = parseUiDate(value)
    if (d) l[field] = d
  } else if (field === 'rate' || field === 'spot') {
    l[field] = roundRate(parseAmount(value) || 0)
  } else if (field === 'amt1' || field === 'swap') {
    l[field] = parseAmount(value) || 0
  } else {
    l[field] = value
  }
  if (AUTO_RECALC.includes(field)) l = recalcAutoLeg(l)
  return legs.map((x, i) => (i === index ? l : x))
}

export function validateAutoLegs(mc: MasterContract, legs: AutoLeg[]): string[] {
  const m = modelOf(mc.fxModel)
  const a = legs[0]
  const b = legs[1]
  if (!a || !b) return []
  const tolDays = m?.valueDateToleranceDays || 5
  const msgs: string[] = []
  const maxAmt = mcBalance(mc) * (1 + (m?.tolerancePct || 5) / 100)
  if (!(a.amt1 > 0) && !(b.amt1 > 0)) msgs.push('Enter an amount greater than zero for both deals.')
  if (Math.abs((a.amt1 || 0) - (b.amt1 || 0)) > 0.01) msgs.push('Deal 1 and Deal 2 Amount 1 must be identical.')
  if ((a.amt1 || 0) > maxAmt) msgs.push('Deal amount exceeds the Master Contract available amount plus tolerance.')
  const dayDiff = a.valueDate && b.valueDate ? workingDaysBetween(a.valueDate, b.valueDate) : 999
  if (dayDiff > tolDays) msgs.push(`Deal 1 and Deal 2 value dates must be within ${tolDays} working days.`)
  legs.forEach((l, i) => {
    const n = i + 1
    if (!l.tradeDate) msgs.push(`Deal ${n}: Trade Date is required.`)
    if (!l.valueDate) msgs.push(`Deal ${n}: Value Date is required.`)
    if (!l.entity) msgs.push(`Deal ${n}: Company Code is required.`)
    if (!l.txnType) msgs.push(`Deal ${n}: Transaction Type is required.`)
    if (!l.partner) msgs.push(`Deal ${n}: Partner is required.`)
    if (!(l.rate > 0)) msgs.push(`Deal ${n}: All in Rate must be greater than zero.`)
  })
  return msgs
}

/** Both legs become Created rows at the top under one new PAIR Deal ID; Deal 1 draws the MC. */
export function confirmAutoDeal(
  b: Blotter,
  mcNumber: string,
  legs: AutoLeg[],
  givenDealId?: string,
): { blotter: Blotter; dealId: string } | null {
  const mc = findMc(b.contracts, mcNumber)
  if (!mc || legs.length !== 2) return null
  const c = { ...b.counters }
  // The screen passes the Deal ID SAP issued; only the demo path (tests) still counts up its own.
  const dealId = givenDealId ?? `TSF-${c.dealId++}`
  const created = legs.map((l): BlotterRow => {
    const row = makeRow(c, b.ctx, {
      status: 'CREATED',
      entity: l.entity,
      bp: l.partner,
      txnType: l.txnType,
      buySell: l.bs,
      buySell2: l.bs2,
      curr1: l.curr1,
      amt1: l.amt1,
      portfolio: 'TRADING',
      assignment: l.mode,
      model: mc.fxModel,
      mcRef: mc.mcNumber,
      dealId,
      dealType: `${l.leg} (Auto Deal)`,
      tradeDate: l.tradeDate,
    })
    return {
      ...row,
      tradeDate: l.tradeDate ? new Date(l.tradeDate) : row.tradeDate,
      valueDate: l.valueDate ? new Date(l.valueDate) : row.valueDate,
      curr2: l.curr2,
      buySell2: l.bs2,
      amt2: l.amt2,
      totalRate: l.rate,
      swapPoints: l.swap,
      spotRate: l.spot,
      assignment: l.mode,
      ndfDate: l.fixingDate ? new Date(l.fixingDate) : null,
      ndfRef: l.fixRef || '',
    }
  })
  return {
    dealId,
    blotter: {
      ...b,
      counters: c,
      // Each leg was unshifted in turn, so Deal 2 ends up above Deal 1.
      rows: [...created].reverse().concat(b.rows),
      contracts: drawDown(b.contracts, mc.mcNumber, legs[0]?.amt1 ?? 0),
      deals: [
        ...b.deals,
        {
          dealId,
          mcNumber: mc.mcNumber,
          model: mc.fxModel,
          type: 'PAIR',
          legs: created.map((r) => r.id),
          createdOn: new Date(b.ctx.date),
        },
      ],
    },
  }
}

// ---------------------------------------------------------------- short straddle (screen 9007)

export const ssEligible = (rows: BlotterRow[]): boolean => rows.every((r) => !!modelOf(r.fxModel)?.ssEligible)

export function confirmShortStraddle(
  b: Blotter,
  ids: string[],
  noInvoice: boolean,
): { blotter: Blotter; ssDealId: string } {
  const rows = ids.map((id) => b.rows.find((r) => r.id === id)).filter((r): r is BlotterRow => !!r)
  const c = { ...b.counters }
  const ssDealId = `SS-${c.ssDealId++}`
  const dealType = `Short Straddle${noInvoice ? ' (No-Invoice)' : ''}`
  return {
    ssDealId,
    blotter: {
      ...b,
      counters: c,
      rows: b.rows.map((r) => (ids.includes(r.id) ? { ...r, status: 'RELEASED', dealId: ssDealId, dealType } : r)),
      checked: b.checked.filter((id) => !ids.includes(id)),
      deals: [
        ...b.deals,
        {
          dealId: ssDealId,
          mcNumber: rows[0]?.mcRef || '–',
          model: rows[0]?.fxModel ?? '',
          type: 'SS',
          legs: ids,
          createdOn: new Date(b.ctx.date),
        },
      ],
    },
  }
}

// ---------------------------------------------------------------- auto spot

/** The Create Spot popup's starting values: from the one selected row, else its defaults. */
export function autoSpotForm(sel: BlotterRow[], b: Blotter): AutoSpotForm {
  const r = sel.length === 1 ? sel[0] : undefined
  const entities = spotEntities()
  return {
    dealId: r?.dealId || b.deals[0]?.dealId || '1100000106',
    company: r && entities.some((e) => e.code === r.entity) ? r.entity : (entities[0]?.code ?? ''),
    txnType: txnTypeOf('SPOT')?.sapType ?? SPOT_TXN_TYPES[0]?.code ?? '',
    bp: spotPartners(b.partners)[0]?.code ?? '',
    tradeDate: fmtDate(b.ctx.date),
    valueDate: fmtDate(nextWorkingDay(addDays(b.ctx.date, 2))),
    rate: r ? fmtNum(r.spotRate, 4) : '83.2000',
    buyCurr: r ? r.curr1 : 'USD',
    sellCurr: r ? r.curr2 : 'INR',
    buyAmt: r ? fmtNum(r.amt1) : '0.00',
    sellAmt: r ? fmtNum(r.amt2) : '25,600.00',
  }
}

/** Create Spot books with one SAP partner only. */
export const spotPartners = (partners: BusinessPartner[]): BusinessPartner[] =>
  partners.filter((p) => p.code === SPOT_PARTNER_CODE)

/** The entities whose company codes Create Spot offers (SG03, AE13). */
export const spotEntities = (): Entity[] =>
  SPOT_COMPANY_CODES.map((cc) => ENTITIES.find((e) => e.cocode === cc)).filter((e): e is Entity => !!e)

/** The Transaction Type list, each line with its product type: "12A 600 - FX Spot: External-Spot". */
export const spotTxnOptions = (): Option[] =>
  SPOT_TXN_TYPES.map((t) => ({ value: t.code, label: `${t.product} ${t.code} - ${t.desc}` }))

// ---------------------------------------------------------------- FX Txn List (ZSGTSF_RFX_LIST)

export const companyCodeOfRow = (r: BlotterRow): string => r.companyCode || entityOf(r.entity)?.cocode || r.entity
export const currencyPairOfRow = (r: BlotterRow): string => `${r.curr1 || ''}/${r.curr2 || ''}`

export const defaultListCriteria = (ctx: Ctx, group: string, trader: string): TxnListCriteria => ({
  date: fmtDate(ctx.date),
  group,
  trader,
  cpair: '',
  layout: 'DEFAULT',
  email: false,
})

/** Run: rows traded on the Blotter Date matching the filters; null when the date is unreadable. */
export function runTxnList(rows: BlotterRow[], crit: TxnListCriteria): BlotterRow[] | null {
  const d = parseUiDate(crit.date)
  if (!d) return null
  const ds = fmtDate(d)
  // ZTSF_PRE_MATURE = '' in the ABAP; nothing on this page is ever pre-mature.
  return rows.filter(
    (r) =>
      fmtDate(r.tradeDate) === ds &&
      (!crit.group || r.group === crit.group) &&
      (!crit.trader || r.trader === crit.trader) &&
      (!crit.cpair || currencyPairOfRow(r) === crit.cpair),
  )
}

/** P&L: each Deal ID's Amount 2 summed, shown on its D1 leg in the non-USD currency. */
export function listPnl(r: BlotterRow, listed: BlotterRow[]): { pnl: number | null; curr: string } {
  const curr = r.curr1 !== 'USD' ? r.curr1 : r.curr2
  if (!(r.dealType || '').startsWith('D1') || !r.dealId) return { pnl: null, curr }
  const pnl = listed.filter((x) => x.dealId === r.dealId).reduce((s, x) => s + (num(x.amt2) || 0), 0)
  return { pnl, curr }
}

// ---------------------------------------------------------------- upload

export const normalizeHeader = (h: string | null | undefined): string =>
  String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

/** One CSV / TSV line; double quotes group a field and "" is a literal quote. */
export function splitDelimitedLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (c === sep && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Header row plus data rows; tab-separated when the header has a tab, else comma. */
export function parseDelimitedUpload(text: string): Record<string, string>[] {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((x) => x.trim() !== '')
  const [header, ...body] = lines
  if (header === undefined || body.length === 0) return []
  const sep = header.includes('\t') ? '\t' : ','
  const heads = splitDelimitedLine(header, sep).map(normalizeHeader)
  return body.map((line) => {
    const vals = splitDelimitedLine(line, sep)
    const obj: Record<string, string> = {}
    heads.forEach((h, i) => {
      obj[h] = (vals[i] ?? '').trim()
    })
    return obj
  })
}

/** The first non-empty column among the names SAP and the templates use for a field. */
function uploadField(o: Record<string, string>, names: string[]): string {
  for (const n of names) {
    const v = o[normalizeHeader(n)]
    if (v !== undefined && v !== '') return v
  }
  return ''
}

export function canonicalUploadRow(o: Record<string, string>): UploadRow {
  const f = (...names: string[]) => uploadField(o, names)
  return {
    companyCode: f('company code', 'bukrs', 'company_code'),
    tradeDate: f('trade date', 't_date', 'trade_date'),
    bp: f('bp', 'business partner', 'partner'),
    profitCenter: f('profit center', 'pc', 'profit_center'),
    businessArea: f('unit', 'unit(ba)', 'business area', 'business_area'),
    txnType: f('transaction type', 'txn type', 'typ', 'transaction_type'),
    curr1: f('curr 1', 'currency 1', 't_curr', 'curr1'),
    amt1: f('amt 1', 'amount 1', 't_amt', 'amt1'),
    curr2: f('curr 2', 'currency 2', 'o_curr', 'curr2'),
    deal: f('deal', 'olam deal no'),
    buySell: f('buy/sell', 'buy sell', 'buy_sell', 'bs1'),
    valueDate: f('value date', 'v_date', 'value_date'),
    totalRate: f('all in rate', 'all_rate', 'total rate', 'tot_rate'),
    swap: f('swap', 'swap rate'),
    spot: f('spot', 'spot rate'),
    ndfDate: f('ndf fixing date', 'ndf date', 'ndf_date'),
    ndfRef: f('ndf fixing ref', 'ndf ref', 'ndf_ref', 'fixing reference'),
    assignment: f('mode of trade', 'mot', 'assignment'),
    remark: f('remark', 'remarks'),
    externalRef: f('external reference', 'ext_ref'),
    mcRef: f('mc ref', 'mc_ref'),
    dealId: f('deal id', 'ztsf_deal_id'),
    dealDesc: f('deal desc', 'deal description', 'deal_desc'),
    dealType: f('deal type', 'zdeal_type'),
    dealSeq: f('deal seq', 'deal sequence', 'zdeal_seq'),
    blotterDate: f('blotter date', 'zblotr_date'),
    financeProject: f('finance project', 'zfin_proj'),
    txnStatus: f('txn status', 'transaction status', 'ztxn_status'),
    moRemark: f('mo remark', 'zmo_remark'),
    foRemark: f('fo remark', 'zfo_remark'),
  }
}

/** Excel uploads use the spreadsheet reader in upload-file.ts. */
export const isSpreadsheetFile = (name: string): boolean => /\.xls(x)?$/.test(name.toLowerCase())

export function sampleUploadRows(ctxDate: Date): UploadRow[] {
  const d = fmtDate(ctxDate)
  const blank = {
    mcRef: '',
    dealId: '',
    dealDesc: '',
    dealType: '',
    dealSeq: '',
    blotterDate: d,
    financeProject: '',
    txnStatus: '',
    moRemark: '',
    foRemark: '',
  }
  const vd = fmtDate(nextWorkingDay(addDays(ctxDate, 30)))
  return [
    {
      companyCode: 'SG03',
      tradeDate: d,
      bp: 'DBS SG',
      profitCenter: 'TSF-FX',
      businessArea: 'SINGAPORE',
      txnType: 'FWD',
      curr1: 'USD',
      amt1: '250000',
      curr2: 'INR',
      buySell: 'Buy',
      valueDate: vd,
      totalRate: '83.2500',
      swap: '0.05',
      spot: '83.2000',
      ndfDate: '',
      ndfRef: '',
      assignment: '360T',
      remark: 'Sample upload',
      externalRef: 'UPL-001',
      ...blank,
    },
    {
      companyCode: 'SG03',
      tradeDate: d,
      bp: 'SCB SG',
      profitCenter: 'TSF-FX',
      businessArea: 'SINGAPORE',
      txnType: 'NDF',
      curr1: 'USD',
      amt1: '150000',
      curr2: 'INR',
      buySell: 'Sell',
      valueDate: vd,
      totalRate: '83.4000',
      swap: '0.10',
      spot: '83.3000',
      ndfDate: fmtDate(nextWorkingDay(addDays(ctxDate, 28))),
      ndfRef: 'FBIL',
      assignment: 'EMAIL',
      remark: 'NDF sample',
      externalRef: 'UPL-002',
      ...blank,
    },
  ]
}

/** SAP transaction type text or code (620, 632, "NDF" ...) to the blotter's own type. */
export function mapUploadTxnType(v: string): string {
  const x = String(v || '').toUpperCase()
  if (x.includes('NDF') || x === '631' || x === '632') return 'NDF'
  if (x.includes('SPOT') || x === '620' || x === '609') return 'SPOT'
  if (x.includes('TOM') || x === '621') return 'TOM'
  if (x.includes('SWAP') || x === '640') return 'SWAP'
  return 'FWD'
}

/** '2', 'S' and anything starting "SELL" is a sell; everything else a buy. */
export function mapUploadBuySell(v: string): string {
  const x = String(v || '')
    .trim()
    .toUpperCase()
  return x === '2' || x === 'S' || x.startsWith('SELL') ? 'S' : 'B'
}

/** The partner a code / short name / name refers to; an unknown one is added as UPLn. */
export function uploadBpCode(partners: BusinessPartner[], v: string): { code: string; partners: BusinessPartner[] } {
  const x = String(v || '')
    .trim()
    .toUpperCase()
  const b = partners.find(
    (p) => p.code.toUpperCase() === x || (p.short || '').toUpperCase() === x || (p.name || '').toUpperCase() === x,
  )
  if (b) return { code: b.code, partners }
  const code = `UPL${partners.length + 1}`
  return { code, partners: [...partners, { code, short: v || 'Uploaded BP', name: v || 'Uploaded BP', group: 'ALL' }] }
}

/** The entity for a company code or entity code; the first entity when neither matches. */
export function uploadEntity(company: string): Entity {
  const x = String(company || '')
    .trim()
    .toUpperCase()
  return ENTITIES.find((e) => e.cocode.toUpperCase() === x || e.code.toUpperCase() === x) ?? entityOf('OGA') ?? ENTITIES[0]!
}

export function validateUploadRows(rows: UploadRow[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  rows.forEach((r, i) => {
    const n = i + 1
    const td = parseUploadDate(r.tradeDate)
    const vd = parseUploadDate(r.valueDate)
    const nd = parseUploadDate(r.ndfDate)
    if (!r.companyCode) errors.push(`Row ${n}: Company Code is required.`)
    if (!td) errors.push(`Row ${n}: Trade Date is invalid.`)
    if (!r.bp) errors.push(`Row ${n}: Business Partner is required.`)
    if (!r.businessArea) errors.push(`Row ${n}: Business Area is required.`)
    if (!r.txnType) errors.push(`Row ${n}: Transaction Type is required.`)
    if (!/^(B|BUY|1|S|SELL|2)$/i.test(r.buySell)) errors.push(`Row ${n}: Buy/Sell must be B, Buy, 1, S, Sell or 2.`)
    if (!r.curr1 || !r.curr2) errors.push(`Row ${n}: both currencies are required.`)
    if (r.curr1 && r.curr2 && r.curr1.toUpperCase() === r.curr2.toUpperCase())
      errors.push(`Row ${n}: Curr 1 and Curr 2 cannot be the same.`)
    if (!(uploadNumber(r.amt1) > 0)) errors.push(`Row ${n}: Amount 1 must be a valid number greater than zero.`)
    if (!(uploadNumber(r.totalRate) > 0)) errors.push(`Row ${n}: All in Rate must be a valid number greater than zero.`)
    if (r.valueDate && !vd) errors.push(`Row ${n}: Value Date is invalid.`)
    if (r.ndfDate && !nd) errors.push(`Row ${n}: NDF Fixing Date is invalid.`)
    if (r.blotterDate && !parseUploadDate(r.blotterDate)) errors.push(`Row ${n}: Blotter Date is invalid.`)
    for (const field of ['swap', 'spot'] as const) {
      if (r[field] && !Number.isFinite(uploadNumber(r[field]))) errors.push(`Row ${n}: ${field === 'swap' ? 'Swap' : 'Spot'} must be a valid number.`)
    }
    for (const column of UPLOAD_COLUMNS) {
      if ((r[column.field]?.length ?? 0) > column.length) errors.push(`Row ${n}: ${column.header} exceeds ${column.length} characters.`)
    }
    if (vd && nd && nd > vd) errors.push(`Row ${n}: NDF fixing date cannot be after Value Date.`)
    if (/^(NDF|631)$/i.test(r.txnType) && !r.ndfRef) errors.push(`Row ${n}: NDF Fixing Ref is required.`)
    if (td && (isWeekend(td) || isHoliday(td))) warnings.push(`Row ${n}: Trade Date falls on a non-working day.`)
  })
  return { errors, warnings }
}


// ---------------------------------------------------------------- display

/** Transaction Display (ZSGSLCFM_DISPLAY), label / value pairs. */
export function viewRowPairs(r: BlotterRow, partners: BusinessPartner[]): Array<[string, string]> {
  const tt = txnTypeOf(r.txnType)
  const ent = entityOf(r.entity)
  const bp = partnerOf(partners, r.bp)
  return [
    ['Status', STATUS_LABEL[r.status]],
    ['Reference', rowRef(r)],
    ['Trade Date', fmtDate(r.tradeDate)],
    ['Company Code', `${r.entity} - ${ent ? ent.name : ''}`],
    ['Bank BP', bp ? partnerLabel(bp) : r.bp],
    ['Transaction Type', `${r.txnType} - ${tt ? tt.desc : ''}`],
    ['B/S 1 / B/S 2', `${bsText(r.buySell)} / ${bsText(r.buySell2)}`],
    ['Currency 1 / Amount 1', `${r.curr1} ${fmtNum(r.amt1)}`],
    ['Currency 2 / Amount 2', `${r.curr2} ${fmtNum(r.amt2)}`],
    ['All in Rate', fmtNum(r.totalRate, 4)],
    ['Swap', fmtNum(r.swapPoints, 2)],
    ['Spot', fmtNum(r.spotRate, 4)],
    ['Value Date', fmtDate(r.valueDate)],
    ['Mode of Trade', r.assignment],
    ['Acc Category', r.portfolio],
    ['Profit Center', r.profitCenter],
    ['Unit(BA)', r.businessArea],
    ['NDF Fixing Date', r.ndfDate ? fmtDate(r.ndfDate) : '–'],
    ['NDF Fixing Ref.', r.ndfRef || '–'],
    ['Master Contract', r.mcRef || '–'],
    ['Deal ID / Type', `${r.dealId || '–'} / ${r.dealType || '–'}`],
    ['SAP Txn Status', r.txnStatus ? `${r.txnStatus} - ${fxTxnStatusLabel(r.txnStatus)}` : '–'],
    ...(r.appDataPending ? ([['Application Data', 'Not saved yet – saved again on Refresh']] as Array<[string, string]>) : []),
  ]
}

export function viewMcPairs(mc: MasterContract): Array<[string, string]> {
  return [
    ['Master Contract', mc.mcNumber],
    ['FX Model', `${mc.fxModel} - ${mc.modelDesc}`],
    ['Entity String', mc.entities.join(' → ')],
    ['Currency Pair', mc.currPair],
    ['Commodity', `${mc.commodityCode} - ${mc.commodityDesc}`],
    ['MC Date', fmtDate(mc.mcDate)],
    ['Shipping Window', `${fmtDate(mc.shipStart)} – ${fmtDate(mc.shipEnd)}`],
    ['MC Amount (USD)', fmtNum(mc.amtUSD)],
    ['Utilized (USD)', fmtNum(mc.utilizedUSD)],
    ['Remaining Balance (USD)', fmtNum(mcBalance(mc))],
    ['Ports', `${mc.portShipment} → ${mc.portDestination}`],
  ]
}
