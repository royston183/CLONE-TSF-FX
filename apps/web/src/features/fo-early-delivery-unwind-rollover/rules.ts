/*
 * The business rules of the three Premature Settlement actions, as pure functions: which TXN_STATUS each
 * transaction gets, what APP_STR fields it carries, which Deal ID slot a replacement takes. Each is lifted from
 * the ABAP form named beside it; nothing here calls a service.
 */
import type { AppStrFields } from '../fx-blotter/appStr.ts'
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'

export type PrematureKind = 'early' | 'rollover' | 'unwind'

/** c_619: Early Delivery and Rollover only work on this type. */
export const FORWARD_TXN_TYPE = '619'
/** c_631: NDF. Its transactions go straight to MO Match & Release (07). */
export const NDF_TXN_TYPE = '631'
/** c_00: the Deal Type of a transaction that is not a D1 / D2 leg of its Deal ID. */
export const NON_LEG_DEAL_TYPE = '00'

export const is631 = (txnType: string | null | undefined): boolean => (txnType ?? '').trim() === NDF_TXN_TYPE

/** ZGTCATR_PARAM row the cancellation status is configured in (FORM deal_details, SELECT SINGLE param1). */
export const STATUS_PARAM_PROGRAM = 'ZSGTSF_RMC_CHILD_DET'

/**
 * lv_temp = |0{ gv_03+0(1) }|: "0" + the first character of ZGTCATR_PARAM-PARAM1. It resolves to 03 when
 * PARAM1 starts with 3. A missing row, or a first character that is not a digit, would give ABAP an invalid
 * status ('0 '); there the FO -> MO status 03 is used and `fromConfig` is false so the screen can say so.
 */
export function cancellationStatusFromParam(rows: readonly FxRow[]): { status: string; fromConfig: boolean } {
  const first = rows.find((r) => txt(r, 'PROGNAM') === STATUS_PARAM_PROGRAM) ?? rows[0]
  const lead = first ? txt(first, 'PARAM1').trim().charAt(0) : ''
  if (/^\d$/.test(lead)) return { status: `0${lead}`, fromConfig: true }
  return { status: FX_TXN_STATUS.FO_TO_MO_UNMATCHED, fromConfig: false }
}

/**
 * The TXN_STATUS a newly created CANCELLATION transaction starts with.
 *   NDF (631)         07
 *   Early / Unwind    the configured status (update_vtbfha_fields: "0" + PARAM1(1), normally 03)
 *   Rollover          03 (update_vtbfha_fields_new)
 * `txnType` is the type of the transaction being created.
 */
export function cancellationInitialStatus(kind: PrematureKind, txnType: string, configured: string): string {
  if (is631(txnType)) return FX_TXN_STATUS.MO_MATCH_RELEASE
  return kind === 'rollover' ? FX_TXN_STATUS.FO_TO_MO_UNMATCHED : configured
}

/** The TXN_STATUS of a newly created REPLACEMENT (New Booking): always FO -> MO Unmatched. */
export const REPLACEMENT_INITIAL_STATUS = FX_TXN_STATUS.FO_TO_MO_UNMATCHED

/**
 * The TXN_STATUS the ORIGINAL transaction ends on.
 *   Early Delivery    49 Prematurely Settled
 *   Rollover          61 Rolled Over
 *   Unwind            61 as well: the legacy runs the Rollover update (update_fields_org) after an unwind, and
 *                     that is kept; the label is not "corrected" here.
 *   NDF (631)         07 in all three.
 *
 * `typeInEffect` is the transaction type ABAP tests when it writes this status: update_fields_org(_early) read
 * gs_generalcontractdata_c-transaction_type, which at that point holds the LAST transaction built — the New
 * Booking for Early Delivery / Rollover, the unwind transaction (the original's own type) for an Unwind.
 */
export function originalFinalStatus(kind: PrematureKind, typeInEffect: string): string {
  if (is631(typeInEffect)) return FX_TXN_STATUS.MO_MATCH_RELEASE
  return kind === 'early' ? FX_TXN_STATUS.PREMATURELY_SETTLED : FX_TXN_STATUS.ROLLED_OVER
}

/**
 * Where a FO remark goes in APP_STR. TrmFxApp has NdfFoRem and OptFoRem and no Forward FO remark, so only an
 * NDF transaction (631) can keep it; for a Forward the remark has no destination and `saved` is false.
 */
export function foRemarkFields(txnType: string, remark: string): { fields: AppStrFields; saved: boolean } {
  const text = remark.trim()
  if (!text) return { fields: {}, saved: true }
  if (is631(txnType)) return { fields: { NdfFoRem: text }, saved: true }
  return { fields: {}, saved: false }
}

/**
 * The APP_STR fields a new transaction takes over from the original (get_details -> ls_tsf / ls_forex): Deal ID,
 * description, Master Contract, execution / bank / payment details and the trader code. Only what TrmFxApp holds
 * is copied. TXN_STATUS, Deal Type, BLOTTER_DATE, the remark and the flags are set by the caller.
 */
export function inheritedFields(app: TrmFxApp): AppStrFields {
  const out: Record<string, string | boolean> = {}
  const strings = [
    'ZtsfDealID', 'ZtsfDealDesc', 'ZtsfMcRefNo', 'ZtsfExOptNo', 'ZtsfExSpotNo', 'ZtsfBcurr', 'ZtsfBhbkID', 'ZtsfBhktID',
    'ZtsfScurr', 'ZtsfShbkID', 'ZtsfShktID', 'ZtsfBpayID', 'ZtsfSpayID', 'ZtsfRbukrs', 'ZtsfRpayID', 'ZtsfPbukrs',
    'ZtsfPpayID', 'ZtsfTrftype', 'ZtsfTrftype2', 'ZtsfBnktype', 'ZtsfBnktype2', 'ZolamDealNo', 'Ztrcode',
  ] as const
  const flags = ['ZtsfExeCo', 'ZtsfAccCo'] as const
  for (const k of strings) if (typeof app[k] === 'string' && app[k]?.trim()) out[k] = app[k] as string
  for (const k of flags) if (typeof app[k] === 'boolean') out[k] = app[k] as boolean
  return out as AppStrFields
}

/** APP_STR of a new CANCELLATION: Deal Type 00, premature flag for Early / Unwind (update_vtbfha_fields) but not Rollover. */
export function cancellationAppFields(kind: PrematureKind, app: TrmFxApp, txnType: string, remark: string, today: string): AppStrFields {
  return {
    ...inheritedFields(app),
    ZtsfDealType: NON_LEG_DEAL_TYPE,
    ...(kind === 'rollover' ? {} : { ZtsfPreMature: true }),
    BlotterDate: today,
    ...foRemarkFields(txnType, remark).fields,
  }
}

/** APP_STR of a new REPLACEMENT (New Booking): the original's D1 / D2, premature flag for Early only. */
export function replacementAppFields(kind: PrematureKind, app: TrmFxApp, txnType: string, remark: string, today: string): AppStrFields {
  return {
    ...inheritedFields(app),
    ZtsfDealType: (app.ZtsfDealType ?? '').trim(),
    ...(kind === 'early' ? { ZtsfPreMature: true } : {}),
    BlotterDate: today,
    ...foRemarkFields(txnType, remark).fields,
  }
}

/** The ORIGINAL's APP_STR update: Deal Type 00, the final status, the remark; Rollover / Unwind also mark it premature. */
export function originalUpdateFields(kind: PrematureKind, typeInEffect: string, remark: string, remarkType: string): AppStrFields {
  return {
    ZtsfDealType: NON_LEG_DEAL_TYPE,
    ...(kind === 'early' ? {} : { ZtsfPreMature: true }),
    TxnStatus: originalFinalStatus(kind, typeInEffect),
    ...foRemarkFields(remarkType, remark).fields,
  }
}

/* ---------------- Deal ID slots ---------------- */

export type DealSlot = 1 | 2

/**
 * update_deal_id: a replacement of Deal Type D1 takes ZBUKRS1 / ZRFHA1, one of D2 takes ZBUKRS2 / ZRFHA2, and a
 * transaction of Deal Type 00 takes no slot at all. The ABAP puts everything that is not "…1" into slot 2; here
 * only D1 and D2 are accepted, so an unexpected Deal Type stops before anything is created instead of
 * overwriting slot 2. Returns null for 00 (no slot) and throws for anything else.
 */
export function dealSlotOf(dealType: string): DealSlot | null {
  const type = dealType.trim()
  if (type === NON_LEG_DEAL_TYPE) return null
  if (type === 'D1') return 1
  if (type === 'D2') return 2
  throw new Error(`Deal Type ${type || '(blank)'} has no Deal ID slot to replace; Early Delivery and Rollover need a D1 or D2 transaction.`)
}

/** The Deal ID columns of one slot. */
export const slotColumns = (slot: DealSlot) => ({ bukrs: `ZBUKRS${slot}`, rfha: `ZRFHA${slot}` })

/** Whether the Deal ID row already holds this transaction in the slot — the replacement has been recorded. */
export function slotHolds(row: FxRow, slot: DealSlot, bukrs: string, rfha: string): boolean {
  const c = slotColumns(slot)
  return txt(row, c.bukrs) === bukrs && txt(row, c.rfha) === rfha
}
