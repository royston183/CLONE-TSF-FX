/**
 * The screen's own constants: the transaction status texts it shows.
 *
 * No runtime sample data: the legacy page's dummy deals and value-help lists moved to fixtures.ts
 * (tests only). Company codes and traders come from SAP (api.ts); the NDF deal list is WAITING FOR
 * API because ZSGTSFR026's ABAP source is not exported.
 */
import type { NdfStatus } from './types.ts'

export const STATUS = {
  UNMATCHED: 'FO->MO: Unmatched',
  CORRECTION: 'MO->FO: Correction Required',
  RELEASED: 'Matched & Released',
} as const satisfies Record<string, NdfStatus>

export const STATUSES: NdfStatus[] = [STATUS.UNMATCHED, STATUS.CORRECTION, STATUS.RELEASED]
