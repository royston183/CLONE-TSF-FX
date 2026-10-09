/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The writes they stand for (Confirm, Reject, Update) go to
 * ZSGTSFTR_MAS_CON through api.ts first; these then apply the same change to the table.
 */
import {
  DEFAULT_DATE_FROM,
  DEFAULT_DATE_TO,
  ERRCORR_AFTER_DEAL,
  FX_MODELS,
  MO_REVIEWER,
  STATUS,
  STATUS_KEY,
  STATUS_SHORT,
  entityOf,
  modelOf,
} from './data.ts'
import { fmtDate, fmtDateTime, fmtNum, parseAmountShorthand, safeParseDate } from './format.ts'
import type {
  ChildLeg,
  Filters,
  FxModel,
  Kpis,
  MasterContract,
  McAction,
  Sort,
  SortKey,
  StatusFilter,
  StatusValue,
  ToastKind,
} from './types.ts'

// ---------------------------------------------------------------- queue scope

/**
 * This transaction's work queue only ever surfaces Master Contracts still awaiting MO action:
 * freshly released (Release to MO), or FO's resubmission after a correction (13, or 22 from a
 * Correction-after-Deal). A Deal ID can only ever be assigned once an MC is Confirmed and an
 * FX Deal is booked against it — since Confirmed/In-Use records never appear here, no visible
 * row will ever carry one. Once MO confirms a contract it leaves the queue entirely; a Reject
 * (11) leaves it too — it goes to FO's Error Correction screen, not back here, until FO
 * resubmits it as 13/22.
 */
const QUEUE_STATUSES: StatusValue[] = [STATUS.RELEASE, STATUS.ERRCORR, ERRCORR_AFTER_DEAL]

export const isInQueueScope = (mc: MasterContract) => QUEUE_STATUSES.includes(mc.status)

/**
 * Every status in this queue is actionable the same way: selectable, confirmable or rejectable
 * in bulk, and offered both quick actions in the child-contract modal. There is no
 * special-cased "confirm only" path — a resubmitted correction follows exactly the same logic.
 */
export const isActionable = (mc: MasterContract) => QUEUE_STATUSES.includes(mc.status)

// ---------------------------------------------------------------- filtering / sorting

export const DEFAULT_FILTERS: Filters = {
  q: '',
  entity: 'ALL',
  region: 'ALL',
  model: 'ALL',
  dateFrom: DEFAULT_DATE_FROM,
  dateTo: DEFAULT_DATE_TO,
}

/** Every visible data column exactly as it is rendered in the table, for the search box. */
export function searchHaystack(mc: MasterContract): string {
  return [
    STATUS_SHORT[mc.status],
    mc.mcNumber,
    mc.mcReference,
    mc.dealId,
    mc.originEntity,
    mc.entityId,
    mc.entities.join('-'),
    mc.fxModel,
    mc.modelDesc,
    mc.commodityCode,
    mc.commodityDesc,
    fmtDate(mc.mcDate),
    fmtNum(mc.amtUSD),
    fmtNum(mc.amtOrigin),
    mc.currOrigin,
    mc.exRate.toFixed(4),
    mc.currId,
    mc.currChain.join('-'),
    mc.paymentTerms,
    fmtDate(mc.paymentDate),
    fmtDate(mc.shipStart),
    fmtDate(mc.shipEnd),
    mc.portOfShipment,
    mc.portOfDestination,
    fmtNum(mc.utilizedAmt),
    mc.moRemarks,
    mc.foRemarks,
    mc.enteredBy,
    fmtDateTime(mc.enteredOn, mc.entryTime),
    mc.changedBy,
    mc.changedOn ? fmtDate(mc.changedOn) : '',
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * Every filter EXCEPT status. Kept separate so the KPI totals can be computed "as if status
 * were All" while the table itself still honours the active status filter.
 */
export function matchesNonStatusFilters(mc: MasterContract, f: Filters): boolean {
  const from = safeParseDate(f.dateFrom) ?? new Date(1900, 0, 1)
  const to = safeParseDate(f.dateTo) ?? new Date(2999, 0, 1)
  if (mc.mcDate < from || mc.mcDate > to) return false
  if (f.entity !== 'ALL' && mc.originEntity !== f.entity) return false
  if (f.region !== 'ALL') {
    const ent = entityOf(mc.originEntity)
    if (!ent || ent.region !== f.region) return false
  }
  if (f.model !== 'ALL' && mc.fxModel !== f.model) return false
  const q = f.q.trim().toLowerCase()
  if (q && !searchHaystack(mc).includes(q)) return false
  return true
}

function sortValue(mc: MasterContract, key: SortKey): number | string {
  const v = mc[key]
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return v.toLowerCase()
  return v
}

/**
 * The legacy sort, which ran in place on the already-displayed list. `prior` is that list's
 * order: ties keep it, so sorting by FX Model after MC Number leaves equal models in MC
 * Number order, exactly as the stable in-place sort did. Without it ties keep list order.
 */
export function sortContracts(list: MasterContract[], sort: Sort, prior?: readonly number[] | null): MasterContract[] {
  let base = list.slice()
  if (prior) {
    const rank = new Map(prior.map((n, i) => [n, i]))
    base = base.sort((a, b) => (rank.get(a.mcNumber) ?? Infinity) - (rank.get(b.mcNumber) ?? Infinity))
  }
  return base.sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return 1 * sort.dir
    return 0
  })
}

/** A header click: the same column flips direction, a new one starts ascending. */
export const nextSort = (sort: Sort, key: SortKey): Sort =>
  sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 }

/**
 * The page's applyFilters. `kpiScope` is everything in the queue matching the non-status
 * filters — the pool the KPI cards summarise, so switching the status filter never zeroes out
 * the other card. `rows` narrows that by the status filter and sorts it for the table.
 */
export function filterContracts(
  contracts: MasterContract[],
  filters: Filters,
  statusFilter: StatusFilter,
  sort: Sort,
  prior?: readonly number[] | null,
): { kpiScope: MasterContract[]; rows: MasterContract[] } {
  const kpiScope = contracts.filter((mc) => isInQueueScope(mc) && matchesNonStatusFilters(mc, filters))
  const narrowed = kpiScope.filter((mc) => statusFilter === 'ALL' || STATUS_KEY[mc.status] === statusFilter)
  return { kpiScope, rows: sortContracts(narrowed, sort, prior) }
}

export function computeKpis(list: MasterContract[]): Kpis {
  const counts = { RELEASE: 0, ERRCORR: 0 }
  let totalUSD = 0
  for (const mc of list) {
    const key = STATUS_KEY[mc.status]
    if (key === 'RELEASE' || key === 'ERRCORR') counts[key]++
    totalUSD += mc.amtUSD
  }
  return { total: list.length, counts, totalUSD }
}

// ---------------------------------------------------------------- paging

export function pageOf<T>(list: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
  const current = Math.min(page, totalPages)
  const startIdx = (current - 1) * pageSize
  return {
    rows: list.slice(startIdx, startIdx + pageSize),
    totalPages,
    page: current,
    /** 1-based first and last row shown, 0 when empty — for "Showing a-b of n". */
    first: list.length ? startIdx + 1 : 0,
    last: Math.min(list.length, current * pageSize),
  }
}

/** Up to two page buttons either side of the current page. */
export function pagerWindow(page: number, totalPages: number): number[] {
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

// ---------------------------------------------------------------- selection

/**
 * The selected contracts, ascending by MC number — the order the page's checked-set object
 * enumerated its numeric keys in, which is the order dialogs list them and toasts name them.
 * A number whose contract has left the queue is dropped, as the page's applyFilters did.
 */
export function checkedContracts(contracts: MasterContract[], checked: ReadonlySet<number>): MasterContract[] {
  return contracts.filter((mc) => checked.has(mc.mcNumber) && isActionable(mc)).sort((a, b) => a.mcNumber - b.mcNumber)
}

export function toggleChecked(checked: ReadonlySet<number>, mc: MasterContract, on: boolean): Set<number> {
  const next = new Set(checked)
  if (!isActionable(mc)) return next
  if (on) next.add(mc.mcNumber)
  else next.delete(mc.mcNumber)
  return next
}

/** The header checkbox: ticks or clears every actionable row on the current page only. */
export function setPageChecked(checked: ReadonlySet<number>, pageRows: MasterContract[], on: boolean): Set<number> {
  let next = new Set(checked)
  for (const mc of pageRows) next = toggleChecked(next, mc, on)
  return next
}

/** Parses the "n,n,n" drag payload the page put on the dataTransfer. */
export function parseDragPayload(text: string): number[] {
  return String(text || '')
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((v) => !Number.isNaN(v))
}

// ---------------------------------------------------------------- confirm / reject

/** A rejection must carry a remark (it is recorded as the MO Remark); a confirmation need not. */
export const isActionValid = (action: McAction, remark: string) => action !== 'reject' || remark.trim() !== ''

/**
 * Confirms or rejects the given contracts: new status, changed by/on stamped, and for a
 * rejection the remark becomes the MO Remark. Either status takes them out of the queue.
 * `changedBy` is who ZCHANGED_BY was written as (api.ts actionMcs); MO_REVIEWER in dummy mode.
 */
export function applyMcAction(
  contracts: MasterContract[],
  mcNumbers: readonly number[],
  action: McAction,
  remark: string,
  now: Date,
  changedBy: string = MO_REVIEWER,
): MasterContract[] {
  const targets = new Set(mcNumbers)
  return contracts.map((mc) =>
    targets.has(mc.mcNumber)
      ? {
          ...mc,
          status: action === 'confirm' ? STATUS.CONFIRMED : STATUS.REJECTED,
          changedBy,
          changedOn: now,
          moRemarks: action === 'reject' ? remark.trim() : mc.moRemarks,
        }
      : mc,
  )
}

export function actionToast(action: McAction, mcs: MasterContract[]): { message: string; kind: ToastKind } {
  const verb = action === 'confirm' ? 'confirmed' : 'rejected'
  const [first] = mcs
  const label = mcs.length === 1 && first ? `Master Contract ${first.mcNumber}` : `${mcs.length} Master Contracts`
  return { message: `${label} ${verb} successfully.`, kind: action === 'confirm' ? 'success' : 'error' }
}

// ---------------------------------------------------------------- edit

/**
 * FX Models offered in the Edit modal: only those configured for this MC's origin entity
 * (the ABAP's WHERE zorigin = ...), i.e. whose entity string ends at that origin.
 */
export const candidateModelsForOrigin = (originEntity: string): FxModel[] =>
  FX_MODELS.filter((m) => m.entities[m.entities.length - 1] === originEntity)

export type EditValues = { amount: string; paymentTerms: string; fxModel: string }

/**
 * Mirrors ZSGTSF_RMC_DETAIL_EDIT (dynpro 9001): the amount, payment terms and FX Model are
 * written back, and the entity and currency strings are re-derived from the model (the SELECT
 * SINGLE against zsgtsftr_rule_bt). An unknown model keeps the contract's current one.
 * api.ts toEditColumns turns the result into the MAS_CON columns written.
 */
export function applyEdit(mc: MasterContract, values: EditValues, now: Date, changedBy: string = MO_REVIEWER): MasterContract {
  const newAmt = parseAmountShorthand(values.amount)
  const model = modelOf(values.fxModel) ?? modelOf(mc.fxModel)
  return {
    ...mc,
    amtUSD: newAmt,
    balUSD: newAmt,
    paymentTerms: values.paymentTerms,
    ...(model
      ? {
          fxModel: model.code,
          modelDesc: model.desc,
          entities: model.entities,
          entityId: model.entityId,
          currChain: model.curr,
          currId: model.currId,
          currOrigin: model.curr[model.curr.length - 1] ?? mc.currOrigin,
        }
      : {}),
    amtOrigin: newAmt * mc.exRate,
    changedBy,
    changedOn: now,
  }
}

// ---------------------------------------------------------------- child contracts

/**
 * The child-contract (trade leg) breakdown: one Sale and one Purchase row per hop of the
 * entity string. The last leg settles in the origin currency and amount, the others in USD;
 * planned invoice amounts only exist once the MC is In Use.
 */
export function buildChildLegs(mc: MasterContract): ChildLeg[] {
  const ents = mc.entities
  const rows: ChildLeg[] = []
  const contractBase = 3100000000 + (mc.mcNumber % 900000)
  for (let i = 0; i < ents.length - 1; i++) {
    const t = `T${i + 1}`
    const seller = ents[i] ?? ''
    const buyer = ents[i + 1] ?? ''
    const isLastLeg = i === ents.length - 2
    const curr = isLastLeg ? mc.currOrigin : 'USD'
    const legAmt = isLastLeg ? mc.amtOrigin : mc.amtUSD
    const ref = contractBase + i * 1000
    const planned = mc.status === STATUS.INUSE ? legAmt : 0
    rows.push({ t, seller, buyer, ref, ps: 'Sale', desc: `${seller}-${buyer}-S`, amt: mc.amtUSD, bal: mc.amtUSD, planned, curr })
    rows.push({ t, seller, buyer, ref, ps: 'Purchase', desc: `${buyer}-${seller}-P`, amt: mc.amtUSD, bal: mc.amtUSD, planned, curr })
  }
  return rows
}
