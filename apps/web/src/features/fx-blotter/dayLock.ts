import { apiFetch, service } from '@slc/api-client'
import { fmtDate } from './format.ts'
import { workingDaysBack } from './logic.ts'
import type { BlotterRow, Ctx } from './types.ts'

/**
 * Lock Blotter (function code LOCK of ZSGTSF_PFX_BLOTTER), kept in ZSGTSFTR_DAYLOCK (TRM Day Wise Locking):
 * one row per blotter date + trader group + trader code once that day is locked, in cloud resource daylock
 * (via /api/localdb/tsf-day-lock). The lock is shared by everyone.
 *
 * The program's rules, as pure functions below:
 *   - LOCK is refused while any transaction is still Created (TXN_STATUS 01), i.e. not yet released to MO;
 *   - LOCK is refused while a row has been started but not created (no RFHA but a partner, profit centre,
 *     business area or transaction type entered);
 *   - a blotter whose own day is locked is read-only;
 *   - a blotter whose previous working day is not locked is read-only too.
 */
const api = service('localdb')('tsf-day-lock')

/** The blotter's own ZB_TYPE ("Deal Source"), TEXT-003 of the program. */
export const BLOTTER_TYPE = 'DE6'

/** YYYYMMDD, the DATS format of ZPDATE. */
export function dats(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** One locked day of one trader: ZPDATE and ZGRP of a ZLOCKED = 'X' row. */
export type LockedDay = { date: string; group: string }

type DayLockRow = { ZB_TYPE?: string; ZGRP?: string; ZPDATE?: string; ZTYPE?: string; ZLOCKED?: string }

/** Every day this trader has locked on the DE6 blotter. */
export async function loadLockedDays(trader: string, signal?: AbortSignal): Promise<LockedDay[]> {
  const body = await apiFetch<{ value?: DayLockRow[] }>(`${api}?${new URLSearchParams({ ZTYPE: trader }).toString()}`, signal ? { signal } : undefined)
  return (body?.value ?? [])
    .filter((r) => r.ZLOCKED === 'X' && r.ZB_TYPE === BLOTTER_TYPE && r.ZTYPE === trader)
    .map((r) => ({ date: r.ZPDATE ?? '', group: r.ZGRP ?? '' }))
}

const path = (ctx: Ctx) => `${api}/${dats(ctx.date)}/${encodeURIComponent(ctx.group)}/${encodeURIComponent(ctx.trader)}`

/** MODIFY zsgtsftr_daylock with ZLOCKED = 'X' for this blotter's date, group and trader. */
export async function lockDay(ctx: Ctx): Promise<void> {
  await apiFetch(path(ctx), { method: 'PUT', body: {} })
}

/** The previous working day, with the factory-calendar holidays skipped (the program's working_holiday_check). */
export const previousWorkingDay = (d: Date): Date => workingDaysBack(d, 1)

/** Where a blotter stands against the day lock. */
export type DayLockState = {
  /** This blotter's own day is locked. */
  locked: boolean
  /** The previous working day, and whether that blotter is still unlocked (which closes this one). */
  previousDate: Date
  previousOpen: boolean
}

/**
 * The state of `ctx` given the days its trader has locked, as the program's PBO reads it: its own day locked, and the
 * previous working day not locked, each close the blotter. There is no exception for a group that has never locked a
 * day: its first blotter stays read-only until the day before it is locked, which LOCK allows even on a closed blotter.
 */
export function dayLockState(locked: readonly LockedDay[], ctx: Ctx): DayLockState {
  const mine = locked.filter((l) => l.group === ctx.group).map((l) => l.date)
  const today = dats(ctx.date)
  const previousDate = previousWorkingDay(ctx.date)
  const previous = dats(previousDate)
  return { locked: mine.includes(today), previousDate, previousOpen: !mine.includes(previous) }
}

/** Why the blotter cannot be edited, or '' when it is open. */
export function closedReason(state: DayLockState | null): string {
  if (!state) return ''
  if (state.locked) return 'Blotter is locked for this date. Nothing can be changed.'
  if (state.previousOpen) return `The blotter of the previous working day (${fmtDate(state.previousDate)}) is not locked. Lock it before working on this date.`
  return ''
}

/** A row the trader has started but not created: no transaction number, yet something entered. */
const started = (r: BlotterRow) => r.status === 'DRAFT' && !!(r.bp || r.profitCenter || r.businessArea || r.txnType)

/** Why LOCK is refused, or '' when the blotter may be locked (the program's checks, in its order). */
export function lockBlocker(rows: readonly BlotterRow[]): string {
  if (rows.some((r) => r.status === 'CREATED')) return 'Release all Created transactions to MO before locking the blotter.'
  if (rows.some(started)) return 'Some rows are started but not created. Create or clear them before locking the blotter.'
  return ''
}
