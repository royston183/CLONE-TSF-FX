/**
 * Runtime constants of ZSGTSFR033 / ZSGTSF_RBILL_ADJUST. No deal data lives here: every Deal ID,
 * FX deal, invoice row and BL comes from SAP through the middleware (api.ts). The old sample
 * deals survive only as test fixtures (fixtures.ts).
 */

/** The transaction code: TVARVC is read under sy-tcode (save_data) and sy-tcode && '_MOD' (invoice_plan). */
export const TCODE = 'ZSGTSFR033'

/**
 * The Deal ID Status list box (FORM drop_down, VRM_SET_VALUES), "<stat> - <desc>" by code. It is
 * swapped in place for each loaded Deal ID, since the list depends on the deal's ZTSF_MODEL.
 */
export const STATUS_TEXT: Record<string, string> = {}

/** Replaces the list box's entries without replacing the object every importer holds. */
export function setStatusTexts(entries: readonly { key: string; text: string }[]): void {
  for (const k of Object.keys(STATUS_TEXT)) delete STATUS_TEXT[k]
  for (const e of entries) STATUS_TEXT[e.key] = e.text
}
