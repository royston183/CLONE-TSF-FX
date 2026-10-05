import type { BlotterRow } from './types.ts'

/**
 * Which SAP deals the user has released to MO from this blotter, remembered across reloads.
 *
 * Release to MO has no home in SAP yet: the FxTransaction service has no field for it, and the
 * Deal ID it would create is not written by the blotter. So a deal read back from SAP on the next
 * load looks like any other Created deal. This keeps the release, with the Deal ID / Master
 * Contract it was assigned, in the browser and puts it back when the deal is loaded again.
 *
 * It is per browser and per user — nobody else sees it, and clearing site data forgets it. It
 * only concerns deals that exist in SAP; the demo rows are never remembered. Storage that is
 * missing or refuses (a private window, blocked site data) just means nothing is remembered.
 */
const KEY = 'fx-blotter:released:v1'

/** What a release set on the row besides its status. */
export type SavedRelease = { dealId: string; dealType: string; mcRef: string; fxModel: string }
export type SavedReleases = Record<string, SavedRelease>
export type ReleaseStore = Pick<Storage, 'getItem' | 'setItem'>

/** A deal's key: the transaction number alone repeats across company codes. */
export const releaseKey = (companyCode: string | undefined, transaction: string): string => `${companyCode ?? ''}-${transaction}`

function browserStore(): ReleaseStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadReleases(store: ReleaseStore | null = browserStore()): SavedReleases {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SavedReleases) : {}
  } catch {
    return {}
  }
}

export function saveReleases(releases: SavedReleases, store: ReleaseStore | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(releases))
  } catch {
    // Nothing to do: the release then lasts only until the page is reloaded.
  }
}

/**
 * The saved releases after the grid changed: every SAP deal now Released is remembered, and a SAP deal
 * on the grid that is no longer Released (reversed, say) is forgotten. Deals not on the grid — another
 * day's — are left as they were.
 */
export function updateReleases(saved: SavedReleases, rows: readonly BlotterRow[]): SavedReleases {
  const next: SavedReleases = { ...saved }
  for (const r of rows) {
    if (!r.live || !r.transactionNumber) continue
    const key = releaseKey(r.companyCode, r.transactionNumber)
    if (r.status === 'RELEASED') next[key] = { dealId: r.dealId, dealType: r.dealType, mcRef: r.mcRef, fxModel: r.fxModel }
    else delete next[key]
  }
  return next
}

/**
 * Deals just read from SAP, with the releases put back. Only a deal that arrives as Created is turned
 * into Released: one SAP reports reversed stays reversed.
 */
export function applyReleases<T extends Omit<BlotterRow, 'id' | 'seq'>>(incoming: readonly T[], saved: SavedReleases): T[] {
  return incoming.map((r) => {
    const s = r.status === 'CREATED' ? saved[releaseKey(r.companyCode, r.transactionNumber)] : undefined
    return s ? { ...r, status: 'RELEASED' as const, ...s } : r
  })
}
