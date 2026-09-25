/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The calls the original left as "Future:" comments are in
 * api.ts; these functions only change what the screen shows.
 */
import { COLUMNS_COMPACT, COLUMNS_DEFAULT, ENTITY_MASTER, FX_MODEL_MASTER, REJECTED } from './data.ts'
import { parseDMY } from './format.ts'
import type {
  Column,
  Criteria,
  CriteriaError,
  CriteriaForm,
  DropdownOption,
  Filters,
  Layout,
  MasterContract,
  Sort,
  SortField,
} from './types.ts'

export const BLANK_CRITERIA_FORM: CriteriaForm = {
  mcDateFrom: '',
  mcDateTo: '',
  mcFrom: '',
  mcTo: '',
  originEntity: '',
  region: '',
  fxModel: '',
  coArea: '',
  mcStatus: '',
  layout: 'default',
}

export const BLANK_CRITERIA: Criteria = {
  mcDateFrom: null,
  mcDateTo: null,
  mcFrom: '',
  mcTo: '',
  originEntity: '',
  region: '',
  fxModel: '',
  coArea: '',
  mcStatus: '',
  layout: 'default',
}

export const NO_FILTERS: Filters = {
  originEntity: '',
  fxModel: '',
  mcStatus: '',
  commodity: '',
  currencyString: '',
  businessPartner: '',
}

export const DEFAULT_SORT: Sort = { field: 'mcNumber', dir: 'asc' }

// ---------------------------------------------------------------- selection criteria

export type CriteriaResult = { ok: true; from: Date; to: Date } | { ok: false; error: CriteriaError }

/** Both MC dates are mandatory, valid DD-MM-YYYY, and From may not be after To. */
export function validateCriteria(fromText: string, toText: string): CriteriaResult {
  const from = parseDMY(fromText.trim())
  const to = parseDMY(toText.trim())
  if (!from || !to) {
    return {
      ok: false,
      error: { from: !from, to: !to, message: 'Please enter a valid Master Contract Date From and To (DD-MM-YYYY).' },
    }
  }
  if (from.getTime() > to.getTime()) {
    return {
      ok: false,
      error: { from: true, to: true, message: 'Master Contract Date — From must be on or before the To date.' },
    }
  }
  return { ok: true, from, to }
}

/** A searchable-dropdown text counts only if it is exactly a known code (case-insensitive). */
export function matchCode(typed: string, codes: readonly { code: string }[]): string {
  const t = typed.trim().toUpperCase()
  return codes.find((c) => c.code.toUpperCase() === t)?.code ?? ''
}

/**
 * Turns the typed selection screen into applied criteria, as View Contracts does. Origin
 * Entity and FX Model text that is not a known code is dropped — and the original then
 * blanks the field — so the returned form is what the screen shows afterwards.
 */
export function applyCriteria(form: CriteriaForm, from: Date, to: Date): { criteria: Criteria; form: CriteriaForm } {
  const originEntity = matchCode(form.originEntity, ENTITY_MASTER)
  const fxModel = matchCode(form.fxModel, FX_MODEL_MASTER)
  return {
    criteria: {
      mcDateFrom: from,
      mcDateTo: to,
      mcFrom: form.mcFrom.trim(),
      mcTo: form.mcTo.trim(),
      originEntity,
      region: form.region,
      fxModel,
      coArea: form.coArea,
      mcStatus: form.mcStatus,
      layout: form.layout,
    },
    form: {
      ...form,
      originEntity: originEntity ? form.originEntity : '',
      fxModel: fxModel ? form.fxModel : '',
    },
  }
}

/** Selection Criteria -> working row set. Without both dates nothing is selected. */
export function getCriteriaRows(all: readonly MasterContract[], c: Criteria): MasterContract[] {
  const { mcDateFrom, mcDateTo } = c
  if (!mcDateFrom || !mcDateTo) return []
  return all.filter((r) => {
    const mcDate = parseDMY(r.mcDate)
    if (!mcDate) return false
    // MC Date >= From AND MC Date <= To (inclusive)
    if (mcDate.getTime() < mcDateFrom.getTime()) return false
    if (mcDate.getTime() > mcDateTo.getTime()) return false

    if (c.mcFrom && Number(r.mcNumber) < Number(c.mcFrom)) return false
    if (c.mcTo && Number(r.mcNumber) > Number(c.mcTo)) return false

    if (c.originEntity && r.originEntity !== c.originEntity) return false
    if (c.region && r.region !== c.region) return false
    if (c.fxModel && r.fxModel !== c.fxModel) return false
    if (c.coArea && r.coArea !== c.coArea) return false
    if (c.mcStatus && r.status !== c.mcStatus) return false
    return true
  })
}

export function currentColumns(layout: Layout): Column[] {
  return layout === 'compact' ? COLUMNS_COMPACT : COLUMNS_DEFAULT
}

/** The searchable dropdown's list: code or description containing the typed text. */
export function filterDropdownOptions(options: readonly DropdownOption[], text: string): DropdownOption[] {
  const q = text.trim().toLowerCase()
  if (!q) return [...options]
  return options.filter((o) => o.code.toLowerCase().includes(q) || o.sub.toLowerCase().includes(q))
}

// ---------------------------------------------------------------- search, quick filters, sort

export function activeFilterCount(f: Filters): number {
  return Object.values(f).filter(Boolean).length
}

const SEARCH_FIELDS: Array<keyof MasterContract> = [
  'mcNumber',
  'mcReferenceNo',
  'originEntity',
  'fxModel',
  'currencyString',
  'status',
  'commodity',
  'businessPartnerD1',
  'businessPartnerD2',
  'portOfShipment',
  'portOfDestination',
]

const DATE_FIELDS: ReadonlySet<SortField> = new Set(['mcDate', 'shipmentStart', 'shipmentEnd'])

export function filterSortRows(
  rows: readonly MasterContract[],
  f: Filters,
  search: string,
  sort: Sort,
): MasterContract[] {
  let out = rows.slice()
  if (f.originEntity) out = out.filter((r) => r.originEntity === f.originEntity)
  if (f.fxModel) out = out.filter((r) => r.fxModel === f.fxModel)
  if (f.mcStatus) out = out.filter((r) => r.status === f.mcStatus)
  if (f.commodity) out = out.filter((r) => r.commodity === f.commodity)
  if (f.currencyString) out = out.filter((r) => r.currencyString === f.currencyString)
  if (f.businessPartner)
    out = out.filter((r) => r.businessPartnerD1 === f.businessPartner || r.businessPartnerD2 === f.businessPartner)

  const q = search.trim().toLowerCase()
  if (q) out = out.filter((r) => SEARCH_FIELDS.some((k) => String(r[k]).toLowerCase().includes(q)))

  const { field } = sort
  const dir = sort.dir === 'asc' ? 1 : -1
  const key = (r: MasterContract): number | string => {
    const v = r[field]
    if (DATE_FIELDS.has(field)) return parseDMY(String(v))?.getTime() ?? 0
    if (typeof v === 'number') return v
    return String(v).toLowerCase()
  }
  out.sort((a, b) => {
    const av = key(a)
    const bv = key(b)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  return out
}

/** A header click: the same column flips direction, a new one starts ascending. */
export function nextSort(s: Sort, field: SortField): Sort {
  return s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
}

export type FilterOptions = Record<keyof Filters, string[]>

/** The filter panel offers only the distinct values actually present in the criteria result. */
export function buildFilterOptions(rows: readonly MasterContract[]): FilterOptions {
  const distinct = (fn: (r: MasterContract) => string) => [...new Set(rows.map(fn).filter(Boolean))].sort()
  return {
    originEntity: distinct((r) => r.originEntity),
    fxModel: distinct((r) => r.fxModel),
    mcStatus: distinct((r) => r.status),
    commodity: distinct((r) => r.commodity),
    currencyString: distinct((r) => r.currencyString),
    businessPartner: [...new Set(rows.flatMap((r) => [r.businessPartnerD1, r.businessPartnerD2]).filter(Boolean))].sort(),
  }
}

/** Up to six page buttons, keeping the current page two from the left where possible. */
export function pageWindow(page: number, totalPages: number): number[] {
  const maxButtons = 6
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + maxButtons - 1)
  start = Math.max(1, end - maxButtons + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

// ---------------------------------------------------------------- selection and rejection

/**
 * Isolated eligibility rule for this screen — a Master Contract that has already been
 * rejected cannot be rejected again. No further backend business rules are assumed beyond
 * what the legacy screens show.
 */
export function isRejectable(c: MasterContract): boolean {
  return c.status !== REJECTED
}

export function getRejectableContracts(rows: readonly MasterContract[]): MasterContract[] {
  return rows.filter(isRejectable)
}

/** Row click or drag-range: flips one row in or out of the selection; rejected rows never enter. */
export function toggleSelection(selected: ReadonlySet<string>, c: MasterContract | undefined): ReadonlySet<string> {
  if (!c || !isRejectable(c)) return selected
  const next = new Set(selected)
  if (next.has(c.mcNumber)) next.delete(c.mcNumber)
  else next.add(c.mcNumber)
  return next
}

/** The header checkbox works on the current page only, and skips rejected rows. */
export function setPageSelection(
  selected: ReadonlySet<string>,
  pageRows: readonly MasterContract[],
  checked: boolean,
): ReadonlySet<string> {
  const next = new Set(selected)
  for (const r of getRejectableContracts(pageRows)) {
    if (checked) next.add(r.mcNumber)
    else next.delete(r.mcNumber)
  }
  return next
}

/** The status transition itself: the listed contracts become Rejected, the rest are untouched. */
export function rejectMasterContracts(contracts: readonly MasterContract[], mcNumbers: readonly string[]): MasterContract[] {
  // The write itself (ZMC_STAT -> 13) is api.ts rejectContracts, awaited before this runs.
  const ids = new Set(mcNumbers)
  return contracts.map((c) => (ids.has(c.mcNumber) ? { ...c, status: REJECTED } : c))
}

export function rejectConfirmText(ids: readonly string[]): { heading: string; subtext: string } {
  return ids.length === 1
    ? { heading: 'Reject selected Master Contract?', subtext: `Master Contract ${ids[0]} will be rejected.` }
    : { heading: 'Reject selected Master Contracts?', subtext: `${ids.length} Master Contracts are selected for rejection.` }
}

export function rejectToastText(ids: readonly string[]): string {
  return ids.length === 1
    ? `Master Contract ${ids[0]} rejected successfully.`
    : `${ids.length} Master Contracts rejected successfully.`
}
