import type { Names, Status } from './types.ts'

/*
 * Runtime constants of ZSGTSFR062 (ZSGTSF_RBANKSETTLE_FX). No sample data: the deals come from
 * SAP through api.ts (WAITING FOR API today); the former demo rows are fixtures.ts (tests only).
 */

/** The calendar's "today" marker: the real date. */
export const TODAY = new Date()

/** Default Value Date range the page opens on and Reset returns to. */
export const DEFAULT_DATE_FROM = '01-09-2026'
export const DEFAULT_DATE_TO = '31-10-2026'

/**
 * Description lookups the screen renders. Filled from SAP, never seeded: `company` is T001
 * (api.ts, in place). `partner` (BUT000 via A_BusinessPartner) and `transfer` (VTBFHA-ZTSF_TRFTYPE
 * texts) stay empty while the worklist waits for its API: there is no row to look up.
 */
export const NAMES: Names = { transfer: {}, partner: {}, company: {} }

export const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Pending Settlement',
  OVERDUE: 'Overdue',
  SETTLED: 'Settled',
  ERRCORR: 'Error Correction',
}

export const STATUS_CLASS: Record<Status, string> = {
  PENDING: 'st-pending',
  OVERDUE: 'st-overdue',
  SETTLED: 'st-settled',
  ERRCORR: 'st-errcorr',
}
