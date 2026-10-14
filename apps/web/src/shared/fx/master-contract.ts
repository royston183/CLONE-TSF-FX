import { fxCreate, fxHasNumberRange, fxList, fxUpdate, isAbort, type FxFilter, type FxRow } from './mw.ts'
import type { Sourced } from './masters.ts'
import { changedStamp, createdStamp } from './sap.ts'

/**
 * The FX transaction tables — Master Contract, its child contracts and its Deal IDs — as the
 * middleware serves them. Every screen maps these rows to its own display shape; the column
 * names stay SAP's so the mapping reads against SE11.
 *
 *   masterContract  ZSGTSFTR_MAS_CON   key ZMC_REF_NO   (range ZSGTSFNR03/01, 2000000001-2999999999)
 *   mcChild         ZSGTSFTR_MCCHILD   key ZMC_REF + ZMC_CHILD + ZCHILD_TYPE
 *   tsfDealId       ZSGTSFTR_DEALID    key ZDEAL_ID + ZDEAL_TYPE + ZSUB_TYPE   (range ZSGTSFNR01/01)
 *   mcDocument      ZSGTSFTR_MC_DMS    key ZDMS_CAT + ZDMS_TYPE + ZMC_REF_NO
 *
 * ZSGTSFV_FX — the view that turns linked Treasury deals into an MC's utilized amount — reads
 * SAP TRM tables and is not in MySQL, so no screen can compute utilization from it yet.
 */

export type McRow = FxRow
export type DealRow = FxRow
export type ChildRow = FxRow

/** All linked Deal IDs for one master contract, including cancelled deals; no sample fallback. */
export function loadLinkedDeals(mcNumber: number, signal?: AbortSignal): Promise<DealRow[]> {
  return fxList('tsfDealId', { ZMC_REF: String(mcNumber) }, { sort: '-ZDEAL_ID', signal })
}

/** ABAP excludes cancelled Deal IDs from utilization: WHERE zdeal_stat <> '30'. */
export const CANCELLED_DEAL = '30'

/**
 * A transaction list: MySQL's answer if the middleware gives one, even an empty one — no
 * rows is a real answer for a transaction table — and the screen's seed rows only when the
 * middleware cannot be reached or fails.
 */
export async function loadTransactions<T>(load: () => Promise<T[]>, seed: () => T[], label: string): Promise<Sourced<T>> {
  try {
    return { rows: await load(), source: 'mysql' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn(`[fx] ${label}: middleware unavailable — showing the screen's dummy rows`, error)
    return { rows: seed(), source: 'dummy' }
  }
}

// ---------------------------------------------------------------- ZSGTSFTR_MAS_CON

export function listMasterContracts(filter: FxFilter = {}, signal?: AbortSignal): Promise<McRow[]> {
  return fxList('masterContract', filter, { sort: '-ZMC_REF_NO', signal })
}

/**
 * Creates a Master Contract and returns the MC number the middleware drew from its range.
 * The number is never picked here: with no range bound, a blank key would be stored as ''.
 */
export async function createMasterContract(data: Record<string, unknown>): Promise<string> {
  if (!(await fxHasNumberRange('masterContract'))) {
    throw new Error('No number range is bound to masterContract.ZMC_REF_NO, so a new MC number cannot be issued.')
  }
  const row: Record<string, unknown> = { ...data, ...(await createdStamp()) }
  delete row['ZMC_REF_NO']
  const { key, assignedNumber } = await fxCreate('masterContract', row)
  const mcNumber = assignedNumber ?? key['ZMC_REF_NO']
  if (!mcNumber) throw new Error('The middleware created the Master Contract but did not report its number.')
  return mcNumber
}

export async function updateMasterContract(mcRef: string, changes: Record<string, unknown>): Promise<void> {
  await fxUpdate('masterContract', { ZMC_REF_NO: mcRef }, { ...changes, ...(await changedStamp()) })
}

/**
 * Moves each MC to `status`, one update per contract as the ABAP loops do. Stops at the
 * first failure and reports which ones had already moved, so a partial result is visible.
 */
export async function setMcStatus(
  mcRefs: readonly string[],
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const done: string[] = []
  for (const ref of mcRefs) {
    try {
      await updateMasterContract(ref, { ...extra, ZMC_STAT: status })
      done.push(ref)
    } catch (error) {
      const moved = done.length ? ` (${done.join(', ')} already moved to ${status})` : ''
      throw new Error(`Could not update Master Contract ${ref}${moved}: ${messageOf(error)}`)
    }
  }
}

// ---------------------------------------------------------------- ZSGTSFTR_DEALID

/** Deal IDs, optionally only those against the given MCs. `in` lists are chunked to keep URLs short. */
export async function listDeals(mcRefs?: readonly string[], signal?: AbortSignal): Promise<DealRow[]> {
  if (!mcRefs) return fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal })
  const out: DealRow[] = []
  for (let i = 0; i < mcRefs.length; i += 50) {
    const chunk = mcRefs.slice(i, i + 50)
    if (chunk.length) out.push(...(await fxList('tsfDealId', { 'ZMC_REF[in]': chunk.join(',') }, { signal })))
  }
  return out
}

/** Creates a Deal ID and returns the number drawn from the Deal ID range (ZSGTSFNR01/01). */
export async function createDeal(data: Record<string, unknown>): Promise<string> {
  if (!(await fxHasNumberRange('tsfDealId'))) {
    throw new Error('No number range is bound to tsfDealId.ZDEAL_ID, so a new Deal ID cannot be issued.')
  }
  const row: Record<string, unknown> = { ...data, ...(await createdStamp()) }
  delete row['ZDEAL_ID']
  const { key, assignedNumber } = await fxCreate('tsfDealId', row)
  const dealId = assignedNumber ?? key['ZDEAL_ID']
  if (!dealId) throw new Error('The middleware created the Deal ID but did not report its number.')
  return dealId
}

/** Deal IDs grouped by MC, cancelled ones left out — the ABAP's view of what uses an MC. */
export function liveDealsByMc(deals: readonly DealRow[]): Map<string, DealRow[]> {
  const byMc = new Map<string, DealRow[]>()
  for (const d of deals) {
    if (String(d['ZDEAL_STAT'] ?? '') === CANCELLED_DEAL) continue
    const ref = String(d['ZMC_REF'] ?? '')
    byMc.set(ref, [...(byMc.get(ref) ?? []), d])
  }
  return byMc
}

// ---------------------------------------------------------------- ZSGTSFTR_MCCHILD

export function listChildren(mcRefs: readonly string[], signal?: AbortSignal): Promise<ChildRow[]> {
  if (!mcRefs.length) return Promise.resolve([])
  return fxList('mcChild', mcRefs.length === 1 ? { ZMC_REF: mcRefs[0]! } : { 'ZMC_REF[in]': mcRefs.join(',') }, { signal })
}

export async function createChildren(rows: readonly Record<string, unknown>[]): Promise<void> {
  const stamp = await createdStamp()
  for (const row of rows) await fxCreate('mcChild', { ...row, ...stamp })
}

// ---------------------------------------------------------------- helpers

/**
 * The middleware answers {error:{message}}, but the gateway itself (a 401 after its restart
 * drops the session, a 502, an unconfigured service) answers OData V2's
 * {error:{message:{value}}}; reading that object as the text showed "[object Object]".
 */
export function messageOf(error: unknown): string {
  const body = (error as { body?: { error?: { message?: unknown; code?: unknown } } } | null)?.body
  const message = body?.error?.message
  const text =
    typeof message === 'string'
      ? message
      : typeof (message as { value?: unknown } | undefined)?.value === 'string'
        ? (message as { value: string }).value
        : typeof body?.error?.code === 'string'
          ? body.error.code
          : error instanceof Error
            ? error.message
            : String(error)
  const status = (error as { status?: unknown } | null)?.status
  return status === 401 ? `${text} Your session has expired — sign out and sign in again.` : text
}
