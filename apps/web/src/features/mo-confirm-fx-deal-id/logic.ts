/**
 * The page's rules as pure functions. Nothing here changes a deal: the only write the screen can
 * make (Cancel Deal ID) is a SAP call in api.ts, and the deal is read back afterwards.
 */
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { STATUS_META } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import type { ActionVisibility, Deal, Leg, PlRow, Sort, SortKey, StatusMeta } from './types.ts'

/** parseInt(code, 10) || 0. */
export function numStatus(code: string): number {
  return parseInt(code, 10) || 0
}

/** STATUS_META lookup with the badge's fallback for an unknown code. */
export function statusMeta(code: string): StatusMeta {
  return STATUS_META[code] ?? { desc: code, cls: 'status-01' }
}

/** A quick pick's text: "1000000231 · Created". */
export function quickPickLabel(entry: { dealId: string; status: string }): string {
  return `${entry.dealId} · ${statusMeta(entry.status).desc}`
}

/**
 * Mirrors ABAP FUNCTION_BUTTON / SET PF-STATUS '111' EXCLUDING logic:
 * UPD / CAN / DEAL_EDIT only while status = 01 (Created); REV only while 02 or 03;
 * PRE / REF / DMS always; the SS button only for a short-straddle deal.
 */
export function actionVisibility(deal: Deal): ActionVisibility {
  const s = deal.status
  return {
    upd: s === '01',
    can: s === '01',
    dealEdit: s === '01',
    rev: s === '02' || s === '03',
    pre: true,
    ref: true,
    dms: true,
    ssDeal: deal.ssDeal === true,
  }
}

/** Load Deal's input: the typed id, trimmed. Whether it exists is SAP's answer, not the screen's. */
export function resolveDealId(input: string): { ok: true; id: string } | { ok: false; error: string } {
  const id = input.trim()
  return id ? { ok: true, id } : { ok: false, error: 'Enter a Deal ID.' }
}

function sortValue(leg: Leg, key: SortKey): string | number | null | undefined {
  if (key === 'txnStatusDesc') return fxTxnStatusLabel(leg.txnStatus)
  // "MC Ref No" carries a data-key but is not a leg field, so every row compares equal.
  if (key === 'mcRef') return undefined
  if (key === 'ndfDate') return leg.ndf?.ndfDate ?? ''
  if (key === 'ndfRef') return leg.ndf?.ndfRef ?? ''
  if (key === 'ndfRate') return leg.ndf?.ndfRate ?? null
  if (key === 'cashAmount') return leg.ndf?.cashAmount ?? null
  if (key === 'cashCurrency') return leg.ndf?.cashCurrency ?? ''
  return leg[key]
}

/** The FX Deals table's rows: the search box filters, then the clicked header sorts. */
export function sortedFilteredLegs(legs: readonly Leg[], search: string, sort: Sort): Leg[] {
  let out = legs.slice()
  const q = search.trim().toLowerCase()
  if (q) {
    out = out.filter((l) => (l.rfha + l.dealType + l.bpName + l.curr1 + l.curr2 + l.desc).toLowerCase().includes(q))
  }
  const { key, dir } = sort
  if (key) {
    out.sort((a, b) => {
      const av = sortValue(a, key)
      const bv = sortValue(b, key)
      // A value SAP does not provide (null) sorts before any real one.
      if (typeof av === 'number' || typeof bv === 'number' || av === null || bv === null) {
        return ((typeof av === 'number' ? av : Number.NEGATIVE_INFINITY) - (typeof bv === 'number' ? bv : Number.NEGATIVE_INFINITY) || 0) * dir
      }
      return String(av).localeCompare(String(bv)) * dir
    })
  }
  return out
}

/** A header click: the same key flips direction, a new key sorts ascending. */
export function nextSort(sort: Sort, key: SortKey): Sort {
  if (sort.key === key) return { key, dir: sort.dir === 1 ? -1 : 1 }
  return { key, dir: 1 }
}

/** Clicking the selected leg again deselects it. */
export function toggleLeg(selected: string | null, rfha: string): string | null {
  return selected === rfha ? null : rfha
}

export function legRowClass(leg: Leg, selected: boolean): string {
  return [leg.txnStatus === '02' ? 'row-pending' : '', selected ? 'row-selected' : ''].filter(Boolean).join(' ')
}

/** The hint beside the leg search. */
export function legNote(selected: string | null): string {
  return selected ? `Leg ${selected} selected` : 'Click a leg to select it'
}

/**
 * The P&L the deal was confirmed with (the figures stored on the Deal ID). With none stored — the
 * deal has not been confirmed — there is nothing to show: the planned P&L is calculated in SAP from
 * data this app cannot read yet.
 */
export function storedPlRows(deal: Deal): PlRow[] {
  const pl = deal.storedPl
  if (!pl) return []
  return [
    { type: `P&L (${pl.currency || 'USD'})`, value: fmtAmt(pl.amount) },
    { type: `P&L Local (${pl.localCurrency || '—'})`, value: fmtAmt(pl.localAmount) },
    { type: 'P&L Rate', value: fmtRate(pl.rate) },
  ]
}
