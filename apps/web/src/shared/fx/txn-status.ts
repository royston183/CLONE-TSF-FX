/**
 * SAP transaction status (TXN_STATUS, ZSGTSFTR_TXNSTAT) for Forward / NDF transactions (ZTYPE 01).
 *
 * The one place the codes are named: screens import FX_TXN_STATUS rather than writing '01' or '03',
 * because the codes are a lifecycle, not a flag. Two that are easy to confuse:
 *
 *   03  FO -> MO Unmatched      what the FO blotter writes when it releases a transaction to MO
 *   07  MO Match & Release      written later, by MO, when it matches and releases for settlement
 *
 * "Released to MO" on the blotter means 03. Nothing on the FO side writes 07, and a 07 that
 * arrives from SAP is never turned back into 03.
 */
export const FX_TXN_STATUS = {
  ERROR_IGNORE: '00',
  FO_CREATE: '01',
  FO_DELETE: '02',
  FO_TO_MO_UNMATCHED: '03',
  MO_TO_FO_CORRECTION: '04',
  FO_ERROR_CORRECTION_REVERSE: '05',
  CORRECTED: '06',
  MO_MATCH_RELEASE: '07',
  BO_TO_FO_CORRECTION: '08',
  NDF_FIXING_PENDING_MO: '10',
  MO_NDF_FIXING_CORRECTION: '11',
  NDF_FIXING_CORRECTED: '12',
  MO_CONFIRM_NDF_FIXING: '13',
  NOVATED: '40',
  PREMATURELY_SETTLED: '49',
  BANK_SETTLEMENT_COMPLETED: '50',
  OFFSET_TRANSACTION: '59',
  ROLLED_OVER: '61',
} as const

export type FxTxnStatus = (typeof FX_TXN_STATUS)[keyof typeof FX_TXN_STATUS]

/** The descriptions in ZSGTSFTR_TXNSTAT for ZTYPE 01. */
export const FX_TXN_STATUS_LABEL: Record<FxTxnStatus, string> = {
  '00': 'Error: Ignore Txn',
  '01': 'FO: Create Txn in Blotter',
  '02': 'FO: Delete Txn in Blotter',
  '03': 'FO->MO: Unmatched',
  '04': 'MO->FO: Correction Required',
  '05': 'FO: Error Correction - Reverse',
  '06': 'FO: Error Correction - Corrected',
  '07': 'MO: Match & Release for Settlement',
  '08': 'BO->FO: Correction Required',
  '10': 'FO: NDF Fixing - pending MO confirmation',
  '11': 'MO: NDF Fixing Correction Req',
  '12': 'FO: NDF Fixing Corrected',
  '13': 'MO: Confirm NDF Fixing',
  '40': 'Novated to New Company code',
  '49': 'Transaction Prematurely settled',
  '50': 'Bank Settlement Completed',
  '59': 'Offset Txn',
  '61': 'Txn Rolled Over',
}

export const fxTxnStatusLabel = (code: string): string => FX_TXN_STATUS_LABEL[code as FxTxnStatus] ?? code

/** Where a status sits on the FO blotter, which only distinguishes Created / Released to MO / Reversed. */
export type BlotterStage = 'CREATED' | 'RELEASED' | 'REVERSED'

const S = FX_TXN_STATUS

/** With the FO desk: created, or sent back to it for correction, or corrected and waiting to be released again. */
const FO_STAGE: ReadonlySet<string> = new Set([S.FO_CREATE, S.MO_TO_FO_CORRECTION, S.CORRECTED, S.BO_TO_FO_CORRECTION])
const REVERSED_STAGE: ReadonlySet<string> = new Set([S.FO_DELETE, S.FO_ERROR_CORRECTION_REVERSE])
/** Past the FO desk: released to MO and everything MO / BO do with it afterwards. */
const RELEASED_STAGE: ReadonlySet<string> = new Set([
  S.FO_TO_MO_UNMATCHED,
  S.MO_MATCH_RELEASE,
  S.NDF_FIXING_PENDING_MO,
  S.MO_NDF_FIXING_CORRECTION,
  S.NDF_FIXING_CORRECTED,
  S.MO_CONFIRM_NDF_FIXING,
  S.NOVATED,
  S.PREMATURELY_SETTLED,
  S.BANK_SETTLEMENT_COMPLETED,
  S.OFFSET_TRANSACTION,
  S.ROLLED_OVER,
])

/** The blotter stage a status shows as, or undefined for a blank / unknown / 00 status (the caller falls back to SAP). */
export function blotterStageOf(txnStatus: string | null | undefined): BlotterStage | undefined {
  const code = (txnStatus ?? '').trim()
  if (FO_STAGE.has(code)) return 'CREATED'
  if (REVERSED_STAGE.has(code)) return 'REVERSED'
  if (RELEASED_STAGE.has(code)) return 'RELEASED'
  return undefined
}

/**
 * The status a Release to MO writes. A transaction still with the FO desk becomes 03; one that is
 * already further along (07 written by MO, a fixing status, ...) keeps its status, so releasing
 * again or retrying a failed save can never move it backwards.
 */
export function statusAfterRelease(current: string | null | undefined): string {
  const code = (current ?? '').trim()
  return !code || code === S.ERROR_IGNORE || FO_STAGE.has(code) ? S.FO_TO_MO_UNMATCHED : code
}

/** What deleting a transaction from the blotter writes: 02 for one still with FO, 05 once it has been released to MO. */
export const statusAfterReverse = (stage: 'CREATED' | 'RELEASED'): string =>
  stage === 'RELEASED' ? S.FO_ERROR_CORRECTION_REVERSE : S.FO_DELETE
