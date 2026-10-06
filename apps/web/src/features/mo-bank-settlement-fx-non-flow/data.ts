/*
 * Runtime constants of ZSGTSFR104 (ZSGTSF_RNFX_DEALFLOW). No sample data lives here: the deals,
 * company codes, house banks and transfer types come from SAP through api.ts (or wait for an
 * API there). The former demo deals and masters are test fixtures in fixtures.ts.
 */
export const PAGE_SIZES = [8, 15, 25, 50] as const
export const DEFAULT_PAGE_SIZE = 15

/** Value Date range the page opens with (and Reset returns to). */
export const DEFAULT_DATE_FROM = '01-09-2026'
export const DEFAULT_DATE_TO = '31-12-2026'
