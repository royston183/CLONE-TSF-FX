/**
 * Constants of the screen. The page's dummy deals, invoices, premiums, replacement pool and
 * documents are gone: everything is read from SAP (see api.ts) and a value SAP does not provide
 * is shown blank, never invented.
 */
import type { StatusMeta } from './types.ts'

/**
 * The status badge's colour class per Deal ID status. The descriptions are the page's fallback
 * and are replaced by ZSGTSFTR_DEAL_ST's own texts as soon as a deal loads (applyStatusTexts).
 */
export const STATUS_META: Record<string, StatusMeta> = {
  '01': { desc: 'Created', cls: 'status-01' },
  '02': { desc: 'Pending MO Confirmation', cls: 'status-02' },
  '03': { desc: 'MO Confirmed', cls: 'status-03' },
  '07': { desc: 'Ready / Settled', cls: 'status-07' },
  '30': { desc: 'No Invoice Plan', cls: 'status-30' },
}

/** ZSGTSFTR_DEALID-ZDEAL_STAT = 30: "Deal ID Cancelled". */
export const CANCELLED_STATUS = '30'

/**
 * What the screen cannot do with the services registered today, each worded as the tooltip of
 * the control it disables. The reasons are the real blockers found against ZSGTSF_PDEAL_ID_ANALYS,
 * not placeholders.
 */
export const GAPS = {
  confirm:
    'SAP gap: Confirm needs the invoice plan (currency string ZSGTSFTR_CUR_STR and profit margin ZSGTSFTR_ORG_PRO are not readable), the SAP exchange rate (BAPI_EXCHANGERATE_GETDETAIL), the lead currency (ZSGTRMFM_LEAD_CURR), a server-side number from SNRO ZSGTRMNR14 for the invoice reference, a write to ZSGTSFTR_INV_REF, and BAPI_FTR_FXT_CHANGE to stamp the Master Contract on the transactions.',
  editPair:
    'SAP gap: Edit Deal Pair rewrites the TSF fields of the old and new transaction through BAPI_FTR_FXT_CHANGE (ZSGTRMFM_VTBFHA_EXPORT), which the FxTransaction service does not offer.',
  reverse:
    'SAP gap: Reverse MO Confirmation sets the status to 01 and then deletes the saved invoice plan (ZSGTSFTR_INV_REF). The middleware client has no delete, and running only the first step would leave the deal half-reversed.',
  premium: 'SAP gap: Premium Adjustment reads ZSGTSFCDS_OPTION, and no FX options service is registered.',
  dms: 'SAP gap: no document (DMS) service is registered for ZSGTSFFM_DMS, so the Deal ID documents cannot be shown or attached.',
  ssDeal:
    'SAP gap: Confirm & Save SS Deal ID creates the short-straddle deal in SAP and uses the same missing pieces as Confirm.',
  options:
    'SAP gap: this is an option deal (FX2). Its transactions come from ZSGTSFCDS_OPTION and no FX options service is registered, so only the transaction numbers are shown.',
  pl: 'The planned P&L is worked out in SAP from the exchange rate, the currency string and the profit margin, none of which can be read yet. The figures here are the ones stored on the Deal ID when it was confirmed.',
} as const
