import { fxList, isAbort, type FxFilter, type FxRow } from './mw.ts'

/**
 * FX master data, MySQL first and each screen's seed data second.
 *
 * The masters are custom Z tables, so they belong in MySQL. Several are registered but hold
 * no rows yet (ZSGTSFTR_MC_STAT, _PAYMENT, _PORTGRP, _RULE_BT, _TOLR as of 2026-09-25), and
 * an empty value help reads as broken rather than as "not migrated". So an empty answer
 * counts as a miss here, exactly like an unreachable middleware, and the screen keeps the
 * dummy list it already had. There is no SAP OData service for any of them to fall back to.
 */

export type MasterSource = 'mysql' | 'dummy'
export type Sourced<T> = { rows: T[]; source: MasterSource }

/** The FX masters by middleware resource, with the SAP table each one serves. */
export const FX_MASTERS = {
  commodity: 'ZSGTSFTR_COMODIT',
  comp: 'ZSGTSFTR_COMP',
  entityString: 'ZSGTSFTR_ENT_STR',
  paymentTerm: 'ZSGTSFTR_PAYMENT',
  portGroup: 'ZSGTSFTR_PORTGRP',
  fxModel: 'ZSGTSFTR_RULE_BT',
  mcStatus: 'ZSGTSFTR_MC_STAT',
  tolerance: 'ZSGTSFTR_TOLR',
  dmsType: 'ZSGTSFTR_DMS_TYP',
  trmTrader: 'ZSGTRMTR_TRADER',
} as const

export type FxMaster = keyof typeof FX_MASTERS

/**
 * Loads one master and maps it; falls back to `dummy` when the middleware fails or the
 * mapped list comes back empty. The degrade is always logged, so a silently-dummy screen
 * can still be traced.
 */
export async function loadMaster<T>(
  resource: FxMaster,
  map: (rows: FxRow[]) => T[],
  dummy: readonly T[],
  options: { filter?: FxFilter | undefined; signal?: AbortSignal | undefined } = {},
): Promise<Sourced<T>> {
  try {
    const rows = map(await fxList(resource, options.filter, { signal: options.signal }))
    if (rows.length) return { rows, source: 'mysql' }
    console.warn(`[fx] ${resource} (${FX_MASTERS[resource]}) has no rows in MySQL — using the screen's dummy values`)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn(`[fx] ${resource} (${FX_MASTERS[resource]}) unavailable — using the screen's dummy values`, error)
  }
  return { rows: [...dummy], source: 'dummy' }
}

/** Distinct by a key, keeping the first occurrence: RULE_BT repeats a model per link model. */
export function distinctBy<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const k = key(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Swaps a screen's master list for the loaded rows without replacing the array, so every
 * module that imported it — and every find* helper closed over it — sees the new rows.
 */
export function replaceInPlace<T>(list: T[], rows: readonly T[]): void {
  list.splice(0, list.length, ...rows)
}

/**
 * ZSGTSFTR_ENT_STR's ID for an entity string, for FX models that come from dummy data and so
 * carry no ZENT_ID of their own. Several IDs can share a string (E014 and E026 are both
 * OGA-OSIPL-DMCC); the one flagged for FX (ZFX = 'X') wins.
 */
export function entityIdFor(entityStrings: readonly FxRow[], entityString: string): string {
  const matches = entityStrings.filter((r) => txt(r, 'ZENT_DESC') === entityString)
  const fx = matches.find((r) => txt(r, 'ZFX') === 'X') ?? matches[0]
  return fx ? txt(fx, 'ZENT_ID') : ''
}

/** Text of a column, trimmed; '' for null. */
export const txt = (row: FxRow, column: string): string => String(row[column] ?? '').trim()
