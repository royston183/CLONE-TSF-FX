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
  ssDeal:
    'Not available yet: Confirm & Save SS Deal ID creates the short-straddle deal from the option legs (ZSGTSFCDS_OPTION), which no service provides.',
  premium:
    'Not available yet: Premium Adjustment needs the option data (ZSGTSFCDS_OPTION, no FX options service is registered) and an RBI exchange-rate API (BAPI_EXCHANGERATE_GETDETAIL, rate type RBI). The rate must come from the backend, not the browser.',
  options:
    'This is an option deal (FX2). Its transactions come from ZSGTSFCDS_OPTION and no FX options service is registered, so only the transaction numbers are shown.',
  pl: 'The figures stored on the Deal ID when it was confirmed. A deal that is not yet confirmed shows the planned P&L calculated from the TCURR rate, the currency string (ZSGTSFTR_CUR_STR) and the origin profit margin (ZSGTSFTR_ORG_PRO).',
} as const
