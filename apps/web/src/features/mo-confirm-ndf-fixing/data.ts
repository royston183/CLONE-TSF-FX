/**
 * The screen's constants, from SAP's own status master (ZSGTSFTR_TXNSTAT type 01). No sample data:
 * company codes, traders and the deal queue are all read from SAP (api.ts).
 */
import { TXN } from '../../shared/fx/ndf.ts'

/** The MO queue: "10 FO: NDF Fixing - pending MO confirmation" and "12 FO: NDF Fixing Corrected". */
export const MO_QUEUE = [TXN.FIXED, TXN.CORRECTED] as const

/** Match & Release -> "13 MO: Confirm NDF Fixing" (SAP action "Fixing Settlement"). */
export const STATUS_CONFIRMED = TXN.CONFIRMED

/** Correction Required -> "11 MO: NDF Fixing Correction Req" (SAP action "Change Fixing"). */
export const STATUS_CORRECTION = TXN.CORRECTION_REQUIRED

/** NDF_MO_REM's length in ZSGTSFTR_APP_STR. */
export const MO_REMARK_MAX = 80
