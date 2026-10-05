/*
 * Pure business rules for the FX non-flow bank settlement page: filters, KPIs, sort, paging,
 * single-row selection, house bank / account options, the update log and the post / test-run
 * guards. No DOM, no state, no master data of its own (callers pass it in), so all of it is
 * unit-testable.
 */
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from './data.ts'
import { fmtDate, parseDMY } from './format.ts'
import type {
  BankForm,
  BankStatus,
  Deal,
  DealStatus,
  Filters,
  HouseAccount,
  HouseBank,
  HouseBanks,
  KpiCounts,
  PostGuard,
  Sort,
  SortKey,
  ToastKind,
  UpdateLogEntry,
} from './types.ts'

export const ALL = 'ALL'

export const DEFAULT_FILTERS: Filters = {
  search: '',
  bukrs: [ALL],
  dateFrom: DEFAULT_DATE_FROM,
  dateTo: DEFAULT_DATE_TO,
  bank: 'ALL',
  status: 'ALL',
  ccy: 'ALL',
}

export const DEFAULT_SORT: Sort = { key: 'valueDate', dir: 1 }

// ---------------------------------------------------------------- filters

/** Company Code chip click: All resets; others toggle and fall back to All when none remain. */
export function toggleBukrs(selected: string[], code: string): string[] {
  if (code === ALL) return [ALL]
  const without = selected.filter((c) => c !== ALL)
  const idx = without.indexOf(code)
  if (idx === -1) without.push(code)
  else without.splice(idx, 1)
  return without.length ? without : [ALL]
}

/** Company Code + Value Date range — the "selection criteria" part of the filters. */
export function baseSet(deals: Deal[], f: Pick<Filters, 'bukrs' | 'dateFrom' | 'dateTo'>): Deal[] {
  const from = parseDMY(f.dateFrom)
  const to = parseDMY(f.dateTo)
  return deals.filter((d) => {
    const dt = new Date(`${d.valueDate}T00:00:00`)
    if (from && dt < from) return false
    if (to && dt > to) return false
    if (!f.bukrs.includes(ALL) && !f.bukrs.includes(d.bukrs)) return false
    return true
  })
}

export function filterDeals(deals: Deal[], f: Filters): Deal[] {
  const q = f.search.toLowerCase()
  return baseSet(deals, f).filter((d) => {
    if (f.bank !== 'ALL' && d.bankStatus !== f.bank) return false
    if (f.status !== 'ALL' && d.status !== f.status) return false
    if (f.ccy !== 'ALL' && d.ccyPair !== f.ccy) return false
    if (q) {
      const hay = `${d.dealId} ${d.rfha} ${d.counterparty} ${d.trader} ${d.mcRef}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Distinct currency pairs, sorted, for the Ccy Pair dropdown. */
export function ccyPairs(deals: Deal[]): string[] {
  return Array.from(new Set(deals.map((d) => d.ccyPair))).sort()
}

export function dealCountLabel(n: number): string {
  return `${n} deal${n === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------- KPIs

/** KPIs always reflect the full dataset, independent of the filters. */
export function computeKpis(deals: Deal[]): KpiCounts {
  return {
    total: deals.length,
    awaiting: deals.filter((d) => d.bankStatus === 'NOT_ASSIGNED').length,
    ready: deals.filter((d) => d.bankStatus === 'ASSIGNED' && d.status !== 'Settled').length,
    settled: deals.filter((d) => d.status === 'Settled').length,
  }
}

// ---------------------------------------------------------------- sort

export function nextSort(cur: Sort, key: SortKey): Sort {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }
}

export function sortDeals(list: Deal[], sort: Sort): Deal[] {
  const val = (d: Deal) => d[sort.key] ?? ''
  return [...list].sort((a, b) => {
    const av = val(a)
    const bv = val(b)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return 1 * sort.dir
    return 0
  })
}

// ---------------------------------------------------------------- paging

export type PageInfo = { rows: Deal[]; page: number; totalPages: number; size: number; start: number; end: number }

/** One page of rows; the requested page is clamped to the last page like the original. */
export function pageOf(list: Deal[], page: number, size: number): PageInfo {
  const sz = size || 15
  const totalPages = Math.max(1, Math.ceil(list.length / sz))
  const cur = Math.min(page, totalPages)
  const offset = (cur - 1) * sz
  return {
    rows: list.slice(offset, offset + sz),
    page: cur,
    totalPages,
    size: sz,
    start: list.length ? offset + 1 : 0,
    end: Math.min(list.length, cur * sz),
  }
}

/** Page numbers to show: all of them up to 7 pages, otherwise first, last and current ±2. */
export function pagerWindow(page: number, totalPages: number): number[] {
  const out: number[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) continue
    out.push(p)
  }
  return out
}

// ---------------------------------------------------------------- selection

/** Single-row selection: clicking the selected row clears it. */
export function toggleSelected(current: string | null, dealId: string): string | null {
  return current === dealId ? null : dealId
}

/** Selection survives a filter change only while its row is still in the result. */
export function pruneSelection(selected: string | null, filtered: Deal[]): string | null {
  return selected && filtered.some((d) => d.dealId === selected) ? selected : null
}

export function selectedLabel(selected: string | null): string {
  return selected ? '1 selected · drag the row to an action' : '0 selected'
}

// ---------------------------------------------------------------- display classes

export function statusClass(status: DealStatus): string {
  if (status === 'Settled') return 'status-settled'
  if (status === 'Matured') return 'status-matured'
  return 'status-unmatured'
}
export function bankClass(bs: BankStatus): string {
  return bs === 'ASSIGNED' ? 'bank-assigned' : 'bank-not-assigned'
}
export function bankLabel(bs: BankStatus): string {
  return bs === 'ASSIGNED' ? 'Assigned' : 'Not Assigned'
}

// ---------------------------------------------------------------- house bank / account

/** Banks offered for a leg: those with an account in the leg currency, else all of the company's. */
export function bankCandidates(banks: HouseBanks, bukrs: string, curr: string): HouseBank[] {
  const all = banks[bukrs] ?? []
  const withCurr = all.filter((b) => b.accounts.some((a) => a.curr === curr))
  return withCurr.length ? withCurr : all
}

/** Accounts of the chosen house bank (every account of that bank, whatever its currency). */
export function accountOptions(banks: HouseBanks, bukrs: string, hbId: string): HouseAccount[] {
  return (banks[bukrs] ?? []).find((b) => b.id === hbId)?.accounts ?? []
}

export function transferTypeOf(types: Record<string, string>, curr: string): string {
  return types[curr] ?? '—'
}

export const BANK_UPDATED_MSG = 'House Bank and Acc ID Successfully updated'
export const BANK_REQUIRED_MSG = 'House bank and account ID are required'

/**
 * The Update button of the Assign House Bank popup. A leg that already has a bank is left
 * alone; an open leg needs both bank and account. The deal becomes ASSIGNED once both legs
 * carry a bank. No log entries means there was nothing to do.
 */
export function applyBankUpdate(deal: Deal, form: BankForm): { deal: Deal; logs: UpdateLogEntry[] } {
  const next: Deal = { ...deal }
  const logs: UpdateLogEntry[] = []
  if (!deal.hb1) {
    if (form.hb1 && form.acc1) {
      next.hb1 = form.hb1
      next.acc1 = form.acc1
      logs.push({ leg: 'Incoming', ok: true, msg: BANK_UPDATED_MSG })
    } else logs.push({ leg: 'Incoming', ok: false, msg: BANK_REQUIRED_MSG })
  }
  if (!deal.hb2) {
    if (form.hb2 && form.acc2) {
      next.hb2 = form.hb2
      next.acc2 = form.acc2
      logs.push({ leg: 'Outgoing', ok: true, msg: BANK_UPDATED_MSG })
    } else logs.push({ leg: 'Outgoing', ok: false, msg: BANK_REQUIRED_MSG })
  }
  if (logs.length && next.hb1 && next.hb2) next.bankStatus = 'ASSIGNED'
  return { deal: next, logs }
}

export function bankUpdateToast(logs: UpdateLogEntry[]): { message: string; kind: ToastKind } {
  const anyOk = logs.some((l) => l.ok)
  return anyOk
    ? { message: BANK_UPDATED_MSG, kind: 'success' }
    : { message: 'Bank assignment failed — check the fields', kind: 'error' }
}

// ---------------------------------------------------------------- test run / post

export function testRunMessage(deal: Deal): string {
  return `Test run completed for ${deal.dealId} (Txn ${deal.rfha}). RFTBBB00 ran in test mode — no documents were posted.`
}

/** TBB1 Post is only offered once both legs have a bank, and never twice. */
export function postGuard(deal: Deal): PostGuard {
  if (deal.bankStatus !== 'ASSIGNED') {
    return { ok: false, message: 'Assign the house bank & account for both legs before posting.', kind: 'error' }
  }
  if (deal.status === 'Settled') {
    return { ok: false, message: `${deal.dealId} is already settled.`, kind: '' }
  }
  return { ok: true }
}

export function postHint(deal: Deal): string {
  return `This runs RFTBBB00 for real (P_TEST = space) and creates the settlement document for both legs on value date ${fmtDate(deal.valueDate)}. This cannot be undone from this screen.`
}

/** A dummy settlement document number: "19" + 7 digits. `rand` is injectable for tests. */
export function newDocNo(rand: () => number = Math.random): string {
  return `19${1000000 + Math.floor(rand() * 8999999)}`
}

/** The deal after a successful post: both documents set, first one shown, status Settled. */
export function postDeal(deal: Deal, doc1: string, doc2: string): Deal {
  return { ...deal, doc1, doc2, fiDoc: doc1, status: 'Settled' }
}

export function postedMessage(deal: Deal): string {
  return `Posting submitted for ${deal.dealId}. Settlement document ${deal.fiDoc ?? ''} created.`
}
