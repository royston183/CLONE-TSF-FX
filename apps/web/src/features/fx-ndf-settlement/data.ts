import { dateToIso } from './format.ts'
import type { ColumnDef, ColumnKey, LayoutVariant } from './types.ts'

/**
 * Constants of the screen. No business data lives here: deals come from ZSGTSFV_FX and company
 * codes from T001 (see api.ts). The former seed (companies, banks, deals, BKPF, VTBFHAPO) was
 * removed from the runtime; tests build their own rows.
 */

/** Today (the calendar's "today" mark and the default value-date month). */
export const AS_OF = dateToIso(new Date())

/** Middle-office text of the waiting states (the brief's wording). */
export const WAITING_API = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'
export const NOTHING_POSTED = 'Nothing was posted to SAP.'

/**
 * TXN_STATUS colouring only. The ABAP grid shows the raw TXN_STATUS code (no text table is read),
 * so the cell shows the code; GET_DATA lists status 13 only, 50 is what TBB1 sets.
 */
export const TXN_STATUS_CLASS: Record<string, string> = {
  '13': 'status-text-fixed',
  '50': 'status-text-posted',
}
/** The class of a status code that has no colour of its own. */
export const UNKNOWN_STATUS_CLASS = 'status-text-draft'

/** FORM GET_DATA's constants. */
export const GET_DATA = {
  sgsart: '12D',
  saktivExcluded: '3',
  minStatus: '07',
  droppedStatus: '08',
  ndfMarker: 'D',
  ndfStatus: '13',
  blart: 'TR',
  xref2Hd: 'TSF',
} as const

/** FORM PDF: SELECT SINGLE zform_name FROM zsgtsftr_bs_pdf WHERE zlet_code = 'L003'. */
export const LETTER_CODE = 'L003'
/** gv_reg of PRINT / PDF. */
export const LETTER_REG = 'NDF Bank Settlement'

export const COLUMN_CATALOG: Record<ColumnKey, ColumnDef> = {
  rfha: { label: 'Transaction No', type: 'link' },
  bukrs: { label: 'Company Code' },
  butxt: { label: 'Company Name' },
  zcom_id: { label: 'TSF Entity' },
  ztsf_deal_id: { label: 'TSF Deal ID' },
  ztsf_mc_ref_no: { label: 'MC Reference No' },
  ltx: { label: 'Product Type' },
  txn_status: { label: 'Status', type: 'status' },
  kontrh: { label: 'Business Partner' },
  bp_name: { label: 'Partner Name' },
  gsppart: { label: 'Contact Person' },
  bs_1: { label: 'Buy/Sell' },
  cpair: { label: 'Currency Pair' },
  curr1: { label: 'Currency 1' },
  amt1: { label: 'Amount 1', type: 'amount' },
  curr2: { label: 'Currency 2' },
  amt2: { label: 'Amount 2', type: 'amount' },
  dblfz: { label: 'Trade Date', type: 'date' },
  delfz: { label: 'Value Date', type: 'date' },
  ndf_date: { label: 'Fixing Date', type: 'date' },
  ndf_ref: { label: 'Fixing Reference ID' },
  ospot: { label: 'Spot Rate', type: 'rate' },
  oswap: { label: 'Swap Rate', type: 'rate' },
  otot_rate: { label: 'All in Rate', type: 'rate' },
  ndf_rate: { label: 'NDF Rate', type: 'rate' },
  cash_curr: { label: 'Cash Currency' },
  zcash_amt: { label: 'Cash Amount', type: 'amount' },
  fi_doc: { label: 'FI Document', type: 'fidoc' },
  nordext: { label: 'External Reference' },
  refer: { label: 'Internal Reference' },
  rdealer: { label: 'Trader' },
  rportb: { label: 'Portfolio' },
  xportb: { label: 'Accounting Category' },
  fo_remark: { label: 'FO Remark' },
  mo_remark: { label: 'MO Remark' },
  ndf_fo_rem: { label: 'NDF FO Remark' },
  ndf_mo_rem: { label: 'NDF MO Remark' },
  cruser: { label: 'Entered By' },
  dcrdat: { label: 'Entered On', type: 'date' },
  upuser: { label: 'Last Changed By' },
  dupdat: { label: 'Changed On', type: 'date' },
}

/**
 * Layout variants (P_LAYOUT, REUSE_ALV_VARIANT_F4). KEPT STATIC: the user's ALV variants live in
 * SAP table LTDX, which no API serves; these are column presets of the screen, not SAP data.
 */
export const LAYOUT_VARIANTS: LayoutVariant[] = [
  { id: '/DEFAULT', text: 'Default layout', cols: ['rfha', 'bukrs', 'zcom_id', 'ztsf_deal_id', 'txn_status', 'bp_name', 'cpair', 'bs_1', 'delfz', 'ndf_date', 'ndf_rate', 'cash_curr', 'zcash_amt', 'fi_doc'] },
  { id: '/BANKSETTLE', text: 'Bank settlement', cols: ['rfha', 'bukrs', 'butxt', 'kontrh', 'bp_name', 'gsppart', 'delfz', 'cash_curr', 'zcash_amt', 'ndf_ref', 'nordext', 'fi_doc'] },
  { id: '/RATES', text: 'Rates and amounts', cols: ['rfha', 'bukrs', 'cpair', 'bs_1', 'curr1', 'amt1', 'curr2', 'amt2', 'ospot', 'oswap', 'otot_rate', 'ndf_rate', 'zcash_amt', 'cash_curr'] },
  { id: '/AUDIT', text: 'Remarks and audit', cols: ['rfha', 'bukrs', 'rdealer', 'cruser', 'dcrdat', 'upuser', 'dupdat', 'fo_remark', 'mo_remark', 'ndf_fo_rem', 'ndf_mo_rem'] },
]

/** First and last day of the month of an ISO date. */
export function monthOf(iso: string): { from: string; to: string } {
  const [y = 0, m = 1] = iso.split('-').map(Number)
  return { from: dateToIso(new Date(y, m - 1, 1)), to: dateToIso(new Date(y, m, 0)) }
}

/**
 * The screen's initial (and Reset) selection. S_BUKRS and S_DATE are OBLIGATORY without a
 * default in the ABAP, so no company is preselected; the value dates start on the current month.
 */
export const DEFAULTS = {
  bukrs: [] as readonly string[],
  dateFrom: monthOf(AS_OF).from,
  dateTo: monthOf(AS_OF).to,
  rfha: '',
  layout: '/DEFAULT',
  pageSize: 20,
} as const

export const PAGE_SIZES = [8, 12, 20] as const

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const CALENDAR_FIRST_YEAR = 2020
export const CALENDAR_LAST_YEAR = 2035

export const TOAST_MS = 3200
/** Time the modal close animation runs before the overlay is removed. */
export const MODAL_CLOSE_MS = 160
/** Delay between Confirm and the action it runs, so the confirm dialog has faded out first. */
export const CONFIRM_DELAY_MS = 170
