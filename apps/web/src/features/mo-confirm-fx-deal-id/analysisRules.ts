/**
 * Deal ID Analysis rules (ZSGTSF_PDEAL_ID_ANALYS) as pure functions: which transactions block a
 * confirmation, which slot a transaction sits in, which transactions may replace one.
 *
 * Two status domains meet here and must stay apart. `txnStatus` is ZSGTSFTR_APP_STR.TXN_STATUS, the
 * transaction's own lifecycle; the Deal ID's ZDEAL_STAT is in shared/fx/deal-status.ts. Nothing in this
 * file converts one into the other.
 */
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxTransaction } from '../../shared/fx/ndf.ts'
import { num } from '../../shared/fx/sap.ts'
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'

/** Slot name -> Deal ID column suffix: D1..D4 -> ZRFHA1..4, DS1/DS2 -> ZRFHA5/6, DSS1/DSS2 -> ZRFHA7/8. */
export const SLOT_ORDER = ['D1', 'D2', 'D3', 'D4', 'DS1', 'DS2', 'DSS1', 'DSS2'] as const
export type SlotName = (typeof SLOT_ORDER)[number]

export const isSlotName = (v: string): v is SlotName => (SLOT_ORDER as readonly string[]).includes(v)

/** The ZRFHAn / ZBUKRSn column pair of a slot. */
export function slotColumns(slot: SlotName): { bukrs: string; rfha: string } {
  const n = SLOT_ORDER.indexOf(slot) + 1
  return { bukrs: `ZBUKRS${n}`, rfha: `ZRFHA${n}` }
}

/** The slot that currently holds BUKRS + RFHA on a Deal ID row, or undefined. */
export function slotOf(deal: FxRow, bukrs: string, rfha: string): SlotName | undefined {
  return SLOT_ORDER.find((slot) => {
    const c = slotColumns(slot)
    return txt(deal, c.rfha) === rfha && txt(deal, c.bukrs) === bukrs
  })
}

/** The Deal ID changes that put `next` in `slot` — the slot is overwritten, never appended to a free one. */
export function slotReplacement(slot: SlotName, next: { bukrs: string; rfha: string }): Record<string, string> {
  const c = slotColumns(slot)
  return { [c.bukrs]: next.bukrs, [c.rfha]: next.rfha }
}

/** A transaction as the rules see it: BUKRS + RFHA and its persisted (APP_STR) status. */
export type TxnRef = { bukrs: string; rfha: string; txnStatus: string }

/** The first status a transaction must have reached before its Deal ID can be confirmed (07, MO Match & Release). */
export const CONFIRM_MIN_TXN_STATUS = FX_TXN_STATUS.MO_MATCH_RELEASE

/** The legacy test `txn_status < '07'` on a CHAR(2) field: a blank status is below it too. */
export const belowConfirmStatus = (txnStatus: string): boolean => txnStatus.trim() < CONFIRM_MIN_TXN_STATUS

/** The transactions that block confirmation, in slot order. */
export const confirmationBlockers = (txns: readonly TxnRef[]): TxnRef[] => txns.filter((t) => belowConfirmStatus(t.txnStatus))

export function blockerMessage(blockers: readonly TxnRef[]): string {
  const first = blockers[0]
  if (!first) return ''
  const status = first.txnStatus.trim() || 'none'
  const more = blockers.length > 1 ? ` (and ${blockers.length - 1} more)` : ''
  return `Transaction ${first.rfha} (company ${first.bukrs}) has transaction status ${status}, below ${CONFIRM_MIN_TXN_STATUS}; it must be matched and released by MO before the Deal ID can be confirmed${more}.`
}

/** Exchange rates on the invoice plan are editable only while the Deal ID is still Created. */
export const exchangeRateEditable = (dealStatus: string): boolean => dealStatus === '01'

/** The statuses a replacement transaction may be in: FO -> MO Unmatched or MO Match & Release. */
export const REPLACEMENT_TXN_STATUSES: readonly string[] = [FX_TXN_STATUS.FO_TO_MO_UNMATCHED, FX_TXN_STATUS.MO_MATCH_RELEASE]

/** What a replacement is compared with: the transaction being replaced, as FxTransaction reports it. */
export type ReplacementReference = {
  bukrs: string
  rfha: string
  sfhaart: string
  delfz: string
  side: string
  currency: string
  amount: number
}

/** FxTransaction.ActiveStatus of a reversed (deleted) transaction: the legacy view's SAKTIV = 3. */
const REVERSED = '3'

/**
 * The legacy view columns, read from the live FxTransaction instead: CURR1 is the lead currency, BS_1 is
 * B when that leg is the bought one, AMT1 is that leg's amount, SFHAART is TransactionType and DELFZ is
 * ValueDate.
 */
export function referenceOf(fx: FxTransaction): ReplacementReference {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  return {
    bukrs: fx.CompanyCode,
    rfha: fx.FinancialTransaction,
    sfhaart: fx.TransactionType ?? '',
    delfz: String(fx.ValueDate ?? '').slice(0, 10),
    side: buysLead ? 'B' : 'S',
    currency: lead,
    amount: Math.abs(num(buysLead ? fx.BuyAmount : fx.SellAmount)),
  }
}

/**
 * Legacy candidate filter for Edit Deal Pair: same company code, a different transaction, same
 * transaction type, end / value date, buy / sell side, currency and amount, not reversed
 * (SAKTIV <> 3) and status 03 or 07. `txnStatus` is the persisted APP_STR status; a candidate without
 * one is not eligible.
 */
export function isEligibleReplacement(ref: ReplacementReference, fx: FxTransaction, txnStatus: string): boolean {
  const c = referenceOf(fx)
  return (
    c.bukrs === ref.bukrs &&
    c.rfha !== ref.rfha &&
    c.sfhaart === ref.sfhaart &&
    c.delfz === ref.delfz &&
    c.side === ref.side &&
    c.currency === ref.currency &&
    Math.round(c.amount * 100) === Math.round(ref.amount * 100) &&
    fx.ActiveStatus !== REVERSED &&
    REPLACEMENT_TXN_STATUSES.includes(txnStatus.trim())
  )
}
