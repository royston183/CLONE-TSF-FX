/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The "Future:" comments mark where the original expected an
 * API call; none exists yet, so contracts live in component state for the session.
 */
import { formatDMY, parseDMY } from './format.ts'
import type { ExpiryConfirm, KeyDateCheck, MasterContract, PostingMode, Sort } from './types.ts'

// ---------------------------------------------------------------- key date

/** The Key Date box's input mask: digits only, hyphens inserted as DD-MM-YYYY is typed. */
export function maskKeyDate(raw: string): string {
  const v = raw.replace(/[^\d]/g, '')
  let out = ''
  if (v.length > 0) out = v.substring(0, 2)
  if (v.length >= 3) out += '-' + v.substring(2, 4)
  if (v.length >= 5) out += '-' + v.substring(4, 8)
  return out
}

export const KEY_DATE_REQUIRED = 'Please enter Key Date.'
export const KEY_DATE_INVALID = 'Enter a valid date in DD-MM-YYYY format.'

export function validateKeyDate(text: string): KeyDateCheck {
  const val = text.trim()
  if (!val) return { ok: false, error: KEY_DATE_REQUIRED }
  const date = parseDMY(val)
  if (!date) return { ok: false, error: KEY_DATE_INVALID }
  return { ok: true, date }
}

// ---------------------------------------------------------------- eligibility and expiry

/** Only an In Use contract whose shipment has ended on or before the Key Date can expire. */
export function isEligibleForExpiry(contract: MasterContract, keyDate: Date): boolean {
  if (contract.status !== 'In Use') return false
  const endDate = parseDMY(contract.shipmentEnd)
  if (!endDate) return false
  return endDate.getTime() <= keyDate.getTime()
}

export function eligibleIds(contracts: readonly MasterContract[], keyDate: Date): string[] {
  return contracts.filter((c) => isEligibleForExpiry(c, keyDate)).map((c) => c.mcNumber)
}

/**
 * saveExpiryUpdate: the listed contracts become Expired on the screen. With MySQL behind it
 * the caller has already moved them 04 -> 09 (api.ts expireOnMysql); a row read from MySQL
 * keeps its code in step with the text.
 */
export function expireContracts(contracts: readonly MasterContract[], mcNumbers: readonly string[]): MasterContract[] {
  const ids = new Set(mcNumbers)
  return contracts.map((c) =>
    ids.has(c.mcNumber) ? { ...c, status: 'Expired', ...(c.statusCode === undefined ? {} : { statusCode: '09' }) } : c,
  )
}

/**
 * loadScreenData once the Key Date is valid. "MC View Only" lists the eligible contracts;
 * "MC View with Expiry Posting" runs the batch job (postExpiryProcess) on them first and lists
 * the contracts it expired. `rowIds` are MC numbers, so later expiries show up in the table.
 * `contracts` is ZSGTSFTR_MAS_CON as read once on mount (api.ts loadContracts); the Key Date
 * and status filter stays here, on the screen, so it is unchanged.
 */
export function loadScreen(
  contracts: readonly MasterContract[],
  keyDate: Date,
  mode: PostingMode,
): { contracts: MasterContract[]; rowIds: string[]; posted: number } {
  const ids = eligibleIds(contracts, keyDate)
  if (mode === 'post') {
    return { contracts: ids.length > 0 ? expireContracts(contracts, ids) : contracts.slice(), rowIds: ids, posted: ids.length }
  }
  return { contracts: contracts.slice(), rowIds: ids, posted: 0 }
}

export function mcCountPhrase(n: number): string {
  return n === 1 ? '1 Master Contract' : `${n} Master Contracts`
}

/** The green banner shown after an automatic expiry posting. */
export function postingBannerText(keyDate: Date, posted: number): string {
  return `for Key Date ${formatDMY(keyDate)}. ${mcCountPhrase(posted)} expired successfully.`
}

// ---------------------------------------------------------------- confirm popup

export const MANUAL_CONFIRM_HEADING = 'Expire selected Master Contract(s)?'

export function manualConfirm(ids: string[]): ExpiryConfirm {
  const [first] = ids
  return {
    mode: 'manual',
    ids,
    heading: MANUAL_CONFIRM_HEADING,
    subtext:
      ids.length === 1
        ? `Master Contract ${first} will be updated from In Use to Expired.`
        : `${ids.length} selected Master Contracts will be updated from In Use to Expired.`,
  }
}

export function batchConfirm(ids: string[]): ExpiryConfirm {
  const n = ids.length
  return {
    mode: 'batch',
    ids,
    heading: n === 1 ? 'Expire eligible Master Contract?' : 'Expire all eligible Master Contracts?',
    subtext:
      n === 1
        ? '1 Master Contract is eligible for expiry based on the selected Key Date. This contract will be updated to Expired.'
        : `${n} Master Contracts are eligible for expiry based on the selected Key Date. These contracts will be updated to Expired.`,
  }
}

export function expiredToast(ids: readonly string[]): string {
  const [first] = ids
  return ids.length === 1 ? `Master Contract ${first} expired successfully.` : `${ids.length} Master Contracts expired successfully.`
}

// ---------------------------------------------------------------- selection

/** A row click (or a sweep during a drag) toggles it — but only an In Use contract. */
export function toggleSelection(
  selected: ReadonlySet<string>,
  contract: MasterContract | undefined,
): ReadonlySet<string> {
  if (!contract || contract.status !== 'In Use') return selected
  const next = new Set(selected)
  if (next.has(contract.mcNumber)) next.delete(contract.mcNumber)
  else next.add(contract.mcNumber)
  return next
}

/**
 * The header checkbox adds or removes every row on the current page. Like the original it
 * does not look at status, so an already expired row on the page is picked up too.
 */
export function setPageSelection(
  selected: ReadonlySet<string>,
  pageRows: readonly MasterContract[],
  checked: boolean,
): ReadonlySet<string> {
  const next = new Set(selected)
  for (const r of pageRows) {
    if (checked) next.add(r.mcNumber)
    else next.delete(r.mcNumber)
  }
  return next
}

/** The compact drag ghost: the MC number, or a count once several rows are carried. */
export function dragLabel(count: number, anchorId: string): string {
  return count > 1 ? `${count} Master Contracts selected` : `MC ${anchorId}`
}

// ---------------------------------------------------------------- table

const DATE_FIELDS = new Set(['mcDate', 'shipmentStart', 'shipmentEnd'])

export function filterSortRows(rows: readonly MasterContract[], search: string, sort: Sort): MasterContract[] {
  let list = rows.slice()
  const q = search.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (r) =>
        r.mcNumber.toLowerCase().includes(q) ||
        (r.mcReferenceNo || '').toLowerCase().includes(q) ||
        (r.originEntity || '').toLowerCase().includes(q) ||
        (r.commodity || '').toLowerCase().includes(q) ||
        (r.mcDescription || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q),
    )
  }
  const { field } = sort
  const dir = sort.dir === 'asc' ? 1 : -1
  const key = (r: MasterContract): string | number => {
    const v = r[field]
    if (DATE_FIELDS.has(field)) return parseDMY(String(v))?.getTime() ?? 0
    return typeof v === 'number' ? v : (v || '').toString().toLowerCase()
  }
  list.sort((a, b) => {
    const av = key(a)
    const bv = key(b)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  return list
}

/** Up to six numbered page buttons, kept around the current page. */
export function pageWindow(page: number, totalPages: number): number[] {
  const maxButtons = 6
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + maxButtons - 1)
  start = Math.max(1, end - maxButtons + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

const STATUS_CLASSES: Record<string, string> = {
  'In Use': 'status-inuse',
  Confirmed: 'status-confirmed',
  Expired: 'status-expired',
  'Pending Approval': 'status-pending',
  Active: 'status-active',
  Settled: 'status-settled',
  Draft: 'status-draft',
  Matured: 'status-matured',
  Rejected: 'status-rejected',
}

export function statusClass(status: string): string {
  return STATUS_CLASSES[status] ?? ''
}

/** "Eligible for Selected Key Date" in the details popup; an already expired contract counts. */
export function eligibilityLabel(contract: MasterContract, keyDate: Date | null): string {
  if (!keyDate) return '—'
  return isEligibleForExpiry(contract, keyDate) || contract.status === 'Expired' ? 'Yes' : 'No'
}
