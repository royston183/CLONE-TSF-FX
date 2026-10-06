/**
 * The page's UI rules, as pure functions. The former mock service calls (confirm, cancel,
 * reverse, edit pair, mock upload) and the invented Planned P&L arithmetic are gone: the
 * writes are api.ts's (or WAITING FOR ACTION API), the data is SAP's.
 */
import { STATUS_CLS } from './data.ts'
import type { ActionVisibility, Deal, DealPick, EditDraft, Leg, Sort, SortKey, StatusMeta } from './types.ts'

/** parseInt(code, 10) || 0. */
export function numStatus(code: string): number {
  return parseInt(code, 10) || 0
}

/** The badge: SAP's text (or the bare code when it has none) and the colour class for the code. */
export function statusMeta(code: string, desc = ''): StatusMeta {
  return { desc: desc || code, cls: STATUS_CLS[code] ?? 'status-01' }
}

/** A quick pick's text: "7000000006 · FO: FX Deals Created". */
export function quickPickLabel(pick: DealPick): string {
  return `${pick.dealId} · ${statusMeta(pick.status, pick.statusText).desc}`
}

/**
 * FORM top_data / function_button: SET PF-STATUS '111' EXCLUDING —
 * status 01: only REV is excluded; any other status: UPD, CAN and DEAL_EDIT are excluded, REV
 * too unless the status is 02 / 03, and REV always when the user is not in TVARVC
 * ZSGTSF_UNWIND. PRE / REF / DMS are never excluded; the SS button shows for a short-straddle
 * model only (as the page always did; SS_DEAL has no toolbar slot in the GUI status).
 */
export function actionVisibility(deal: Deal): ActionVisibility {
  const s = deal.status
  return {
    upd: s === '01',
    can: s === '01',
    dealEdit: s === '01',
    rev: (s === '02' || s === '03') && deal.unwind,
    pre: true,
    ref: true,
    dms: true,
    ssDeal: deal.ssDeal === true,
  }
}

/** Load Deal's lookup: trims and uppercases the typed id, which must be one of the Deal IDs read. */
export function resolveDealId(
  input: string,
  deals: readonly DealPick[],
): { ok: true; id: string } | { ok: false; error: string } {
  const id = input.trim().toUpperCase()
  if (!id) return { ok: false, error: 'Enter a Deal ID.' }
  if (!deals.some((d) => d.dealId === id)) {
    return { ok: false, error: 'Deal ID not found. Try one of the quick picks below.' }
  }
  return { ok: true, id }
}

function sortValue(leg: Leg, key: SortKey): string | number | undefined {
  if (key === 'txnStatusDesc') return statusMeta(leg.txnStatus).desc
  // "MC Ref No" carries a data-key but is not a leg field, so every row compares equal.
  if (key === 'mcRef') return undefined
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
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
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

/** The hint beside the leg search. It keeps its longer drag hint until a leg is first clicked. */
export function legNote(selected: string | null, touched: boolean): string {
  if (selected) return `Leg ${selected} selected`
  return touched
    ? 'Select a leg to enable Edit Deal Pair'
    : 'Select a leg to enable Edit Deal Pair · drag it onto Edit Deal Pair'
}

/** A fresh Edit Deal Pair draft: the select starts locked with nothing chosen. */
export function newEditDraft(oldRfha: string): EditDraft {
  return { oldRfha, editing: false, newRfha: '' }
}

/** The Edit / Editing… toggle. The chosen replacement stays as it was, as the select's value did. */
export function toggleEditing(draft: EditDraft): EditDraft {
  return { ...draft, editing: !draft.editing }
}

/** Deal Update is enabled only once a replacement is chosen. */
export function canUpdatePair(draft: EditDraft): boolean {
  return draft.newRfha !== ''
}
