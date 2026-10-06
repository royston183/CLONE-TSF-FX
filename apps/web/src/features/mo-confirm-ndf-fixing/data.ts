/**
 * Constants of the screen. The page's demo deals, partners, traders and company codes are gone:
 * every list now comes from SAP (see api.ts), and a value SAP does not provide stays blank
 * rather than being invented.
 */
import type { NdfStatus } from './types.ts'

export const STATUS = {
  UNMATCHED: 'FO->MO: Unmatched',
  CORRECTION: 'MO->FO: Correction Required',
  RELEASED: 'Matched & Released',
} as const satisfies Record<string, NdfStatus>

export const STATUSES: NdfStatus[] = [STATUS.UNMATCHED, STATUS.CORRECTION, STATUS.RELEASED]

/** Why Correction Required cannot run: the one place the wording lives. */
export const CORRECTION_GAP =
  'SAP gap: FxTransaction exposes no transaction status (11) or MO remark to write, and has no change action for them (ZSGTRMFM_VTBFHA_EXPORT / BAPI_FTR_FXT_CHANGE).'

/** What View Deals could not apply, as the dialog words it. */
export const SELECTION_GAP = 'SAP gap: the FxTransaction service does not expose it, so it was not applied to the list.'
