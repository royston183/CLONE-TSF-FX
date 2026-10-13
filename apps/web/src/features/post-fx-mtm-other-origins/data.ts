// All demo data and constants for the page, quarantined here. Source programs: ZSGTSF_RMTM_OTHERS /
// transaction ZSGTSFR023. Nothing in this file talks to SAP; the TVARV values, number ranges, spot
// and swap curves and the posting configuration are stand-ins for the tables the program reads.
import type {
  Column,
  ColumnKey,
  Company,
  CurrencyPair,
  DealSeed,
  GlBase,
  LayoutVariant,
  Partner,
  ProfitCentre,
  SpotModel,
} from './types.ts'

/** Fixed demo "today" (there is no live clock). */
export const AS_OF_ISO = '2026-10-05'
/** The last month end before AS_OF_ISO. */
export const DEFAULT_KEY_DATE_ISO = '2026-09-30'
/** sy-uname placeholder. */
export const CURRENT_USER = 'TSFUSER01'
/** TVARV ZTSFMTM_STAT (dummy): transaction statuses left out of the selection. */
export const EXCLUDED_TXN_STATUS: readonly string[] = ['40']
/** TVARV ZSGTRMFM_MTM_SWAP (dummy): half-width, in days, of a month-end bucket. */
export const MTM_WINDOW_DAYS = 15
/** FI document number range start (dummy). */
export const DOC_SEQ_START = 4900001200
/** Decimals per currency; anything not listed has 2. */
export const CCY_DECIMALS: Readonly<Record<string, number>> = { JPY: 0, VND: 0 }
export const POSTED_MESSAGE = 'Document Posted Successfully'
export const PAGE_SIZES: readonly number[] = [8, 12, 20, 50]
export const DEFAULT_PAGE_SIZE = 20
export const TOAST_MS = 3200
export const RFHA_DEBOUNCE_MS = 150
export const KEY_DATE_REQUIRED = 'Key Date is required.'
export const KEY_DATE_INVALID = 'Enter a valid date (DD-MM-YYYY).'
export const KEY_DATE_NOT_MONTH_END = 'Key Date should be Month End Date only.'
export const COMPANY_REQUIRED = 'Select at least one company code.'
export const CALENDAR_YEARS: readonly number[] = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export const MOCK_COMPANIES: readonly Company[] = [
  { bukrs: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL' },
  { bukrs: 'TH10', name: 'Olam (Thailand) Ltd', entity: 'OTL' },
  { bukrs: 'VN10', name: 'Olam Vietnam Limited', entity: 'OVL' },
]

export const MOCK_PROFIT_CENTRES: Readonly<Record<string, ProfitCentre>> = {
  IN11: { prctr: 'PC_IN11_01', pcName: 'Agri Treasury India', rbusa: 'OAI1', baName: 'Olam Agri India' },
  TH10: { prctr: 'PC_TH10_01', pcName: 'Agri Treasury Thailand', rbusa: 'OAT1', baName: 'Olam Thailand' },
  VN10: { prctr: 'PC_VN10_01', pcName: 'Agri Treasury Vietnam', rbusa: 'OAV1', baName: 'Olam Vietnam' },
}

export const MOCK_PARTNERS: readonly Partner[] = [
  { id: '0000510021', name: 'HSBC Ltd' },
  { id: '0000510034', name: 'Citibank N.A.' },
  { id: '0000510047', name: 'Standard Chartered Bank' },
  { id: '0000510052', name: 'JPMorgan Chase Bank' },
  { id: '0000510068', name: 'Deutsche Bank AG' },
  { id: '0000510075', name: 'DBS Bank Ltd' },
  { id: '0000510083', name: 'State Bank of India' },
  { id: '0000510096', name: 'Bangkok Bank PCL' },
  { id: '0000510104', name: 'Vietcombank' },
]

/** Currency pairs with USD as one leg (table ZSGTRMTR_CURPAIR); drives the P_CURR listbox. */
export const MOCK_CURRENCY_PAIRS: readonly CurrencyPair[] = [
  { pair: 'USD-INR', f: 'USD', t: 'INR' },
  { pair: 'USD-THB', f: 'USD', t: 'THB' },
  { pair: 'USD-VND', f: 'USD', t: 'VND' },
  { pair: 'USD-JPY', f: 'USD', t: 'JPY' },
  { pair: 'EUR-USD', f: 'EUR', t: 'USD' },
  { pair: 'GBP-USD', f: 'GBP', t: 'USD' },
  { pair: 'AUD-USD', f: 'AUD', t: 'USD' },
]

/** Month-end spot model (CDS ZSGTRMCDS_SPOT_MAIN stand-in): rate at 30-09-2026 plus monthly drift. */
export const SPOT_MODEL: Readonly<Record<string, SpotModel>> = {
  'USD-INR': { base: 90.4, drift: 0.0034, amp: 0.003, phase: 0.4 },
  'USD-THB': { base: 34.6, drift: -0.0016, amp: 0.004, phase: 1.1 },
  'USD-VND': { base: 26150, drift: 0.0012, amp: 0.002, phase: 2.0 },
  'USD-JPY': { base: 148.2, drift: -0.002, amp: 0.005, phase: 0.7 },
  'EUR-USD': { base: 1.162, drift: 0.0006, amp: 0.0045, phase: 1.6 },
  'GBP-USD': { base: 1.348, drift: 0.0004, amp: 0.004, phase: 2.4 },
  'AUD-USD': { base: 0.665, drift: 0.0003, amp: 0.005, phase: 0.2 },
}

/** Swap curve (CDS ZSGTRMCDS_SWAP_MAIN stand-in): annual swap points, tenors in days (DLFZ). */
export const SWAP_ANNUAL_POINTS: Readonly<Record<string, number>> = {
  'USD-INR': 1.95,
  'USD-THB': -0.62,
  'USD-VND': 190,
  'USD-JPY': -5.1,
  'EUR-USD': 0.0233,
  'GBP-USD': 0.0031,
  'AUD-USD': -0.0152,
}
export const SWAP_TENOR_DAYS: readonly number[] = [30, 60, 90, 120, 180, 270, 365, 545, 730, 1095, 1460, 1825]

/** Dummy ALV layout variants (variants are user-saved in SAP; names and columns are demo values). */
export const LAYOUT_VARIANTS: readonly LayoutVariant[] = [
  { value: '', label: 'Default layout', secondary: 'All columns' },
  { value: '/MTM_VALUATION', label: '/MTM_VALUATION', secondary: 'Valuation summary' },
  { value: '/FI_POSTING', label: '/FI_POSTING', secondary: 'Posting status' },
]
export const LAYOUT_COLUMN_SETS: Readonly<Record<string, readonly ColumnKey[] | null>> = {
  '': null,
  '/MTM_VALUATION': ['rfha', 'cpair', 'bsBu', 'fAmt', 'fCurr', 'cRate', 'ccAmt', 'month', 'monat', 'vSpot', 'vSwap', 'vRate', 'vAmt', 'vGl'],
  '/FI_POSTING': ['bukrs', 'rfha', 'ztsfDealId', 'cpair', 'bsBu', 'vGl', 'mtmDoc', 'revDoc', 'msg'],
}

/** Posting configuration bases (table ZSGTRMTR_ACC_TBL stand-in): one set of G/L accounts per company. */
export const GL_BASES: Readonly<Record<string, GlBase>> = {
  IN11: { loss: 5210010, prov: 2290010, asset: 1390010, gain: 4210010 },
  TH10: { loss: 5210020, prov: 2290020, asset: 1390020, gain: 4210020 },
  VN10: { loss: 5210030, prov: 2290030, asset: 1390030, gain: 4210030 },
}

/*
 * Deal seeds -> [company, pair, productType, foreignAmount, foreignDir, start, maturity, partnerIdx,
 * devBp, postedFor, extra]. The 3rd character of the product type, 'D', means NDF (as in the source:
 * SGSART+2(1) = 'D').
 */
export const DEAL_SEEDS: readonly DealSeed[] = [
  ['IN11', 'USD-INR', 'FXD', 450000000, 'S', '2026-02-17', '2026-10-30', 0, 8, ['2026-08-31']],
  ['IN11', 'USD-INR', 'FXD', 320000000, 'S', '2026-03-09', '2026-11-27', 1, -5, ['2026-08-31']],
  ['IN11', 'USD-INR', 'FXF', 900000000, 'S', '2026-03-24', '2026-12-30', 2, 14, ['2026-08-31', '2026-09-30']],
  ['IN11', 'USD-INR', 'FXD', 275000000, 'B', '2026-04-14', '2027-01-29', 6, -11, []],
  ['IN11', 'USD-INR', 'FXF', 610000000, 'S', '2026-04-28', '2027-02-26', 0, 6, []],
  ['IN11', 'USD-INR', 'FXD', 380000000, 'S', '2026-05-12', '2027-03-31', 5, 20, ['2026-08-31', '2026-09-30']],
  ['IN11', 'USD-INR', 'FXF', 520000000, 'B', '2026-05-26', '2027-04-30', 1, -9, []],
  ['IN11', 'USD-INR', 'FXD', 740000000, 'S', '2026-06-10', '2027-06-30', 2, 3, []],
  ['IN11', 'USD-INR', 'FXD', 215000000, 'S', '2026-07-07', '2027-09-30', 6, 17, []],
  ['IN11', 'USD-INR', 'FXF', 860000000, 'S', '2026-07-21', '2027-12-31', 0, -2, ['2026-08-31', '2026-09-30']],
  ['IN11', 'USD-INR', 'FXD', 430000000, 'B', '2026-08-11', '2028-03-31', 5, 11, []],
  ['IN11', 'USD-INR', 'FXD', 295000000, 'S', '2026-09-08', '2027-05-31', 1, 4, []],
  ['IN11', 'EUR-USD', 'FXF', 2400000, 'S', '2026-04-07', '2026-11-30', 3, 7, []],
  ['IN11', 'EUR-USD', 'FXF', 1750000, 'B', '2026-06-16', '2027-02-26', 4, -8, []],
  ['IN11', 'USD-INR', 'FXD', 500000000, 'S', '2026-10-12', '2027-07-30', 0, 5, []],
  ['IN11', 'USD-INR', 'FXF', 350000000, 'S', '2026-02-03', '2026-08-28', 2, 10, []],
  ['TH10', 'USD-THB', 'FXF', 180000000, 'S', '2026-03-03', '2026-10-30', 7, 9, ['2026-08-31']],
  ['TH10', 'USD-THB', 'FXF', 240000000, 'S', '2026-04-21', '2026-12-30', 0, -14, ['2026-09-30']],
  ['TH10', 'USD-THB', 'FXD', 150000000, 'B', '2026-05-19', '2027-01-29', 2, 12, []],
  ['TH10', 'USD-THB', 'FXF', 310000000, 'S', '2026-06-02', '2027-03-31', 7, -6, []],
  ['TH10', 'USD-THB', 'FXF', 205000000, 'S', '2026-07-14', '2027-06-30', 3, 16, ['2026-09-30']],
  ['TH10', 'USD-THB', 'FXD', 120000000, 'S', '2026-08-18', '2027-09-30', 0, -3, []],
  ['TH10', 'EUR-USD', 'FXF', 3100000, 'B', '2026-05-05', '2027-04-30', 4, 9, []],
  ['TH10', 'USD-JPY', 'FXF', 450000000, 'S', '2026-06-23', '2027-01-29', 3, -12, []],
  ['TH10', 'GBP-USD', 'FXF', 1800000, 'S', '2026-07-28', '2026-12-30', 2, 6, []],
  ['TH10', 'USD-THB', 'FXF', 275000000, 'S', '2026-09-15', '2027-02-26', 7, 4, []],
  ['TH10', 'USD-THB', 'FXF', 190000000, 'B', '2026-11-03', '2027-05-31', 0, -7, []],
  ['TH10', 'AUD-USD', 'FXF', 2900000, 'B', '2026-03-17', '2026-09-25', 2, 8, []],
  ['VN10', 'USD-VND', 'FXD', 130000000000, 'S', '2026-03-31', '2026-10-30', 8, 10, ['2026-08-31']],
  ['VN10', 'USD-VND', 'FXD', 95000000000, 'S', '2026-04-15', '2026-12-30', 0, -9, []],
  ['VN10', 'USD-VND', 'FXD', 210000000000, 'S', '2026-05-22', '2027-02-26', 5, 13, ['2026-09-30']],
  ['VN10', 'USD-VND', 'FXD', 160000000000, 'B', '2026-06-09', '2027-03-31', 8, -4, []],
  ['VN10', 'USD-VND', 'FXD', 75000000000, 'S', '2026-07-02', '2027-05-31', 2, 15, [], { bapiError: 'Profit center PC_VN10_03 is locked for posting' }],
  ['VN10', 'USD-VND', 'FXD', 185000000000, 'S', '2026-08-06', '2027-08-31', 8, 5, []],
  ['VN10', 'EUR-USD', 'FXF', 2200000, 'S', '2026-05-27', '2026-12-30', 5, -6, []],
  ['VN10', 'AUD-USD', 'FXF', 3300000, 'B', '2026-06-30', '2027-01-29', 0, 11, []],
  ['VN10', 'USD-VND', 'FXD', 140000000000, 'S', '2026-09-02', '2027-11-30', 5, 2, []],
  ['VN10', 'USD-VND', 'FXD', 120000000000, 'S', '2026-12-07', '2027-06-30', 8, 7, []],
  // Excluded by source rules (kept to show the selection logic): inactive activity '3' and TVARV-excluded status '40'
  ['IN11', 'USD-INR', 'FXD', 180000000, 'S', '2026-05-04', '2027-01-29', 1, 3, [], { saktiv: '3' }],
  ['TH10', 'USD-THB', 'FXF', 160000000, 'S', '2026-06-08', '2027-02-26', 7, -2, [], { txnStatus: '40' }],
]

export const COLUMNS: readonly Column[] = [
  { key: 'bukrs', label: 'Company Code', type: 'text', group: 'ext' },
  { key: 'butxt', label: 'Company Name', type: 'text', group: 'ext' },
  { key: 'rfha', label: 'Transaction', type: 'text', group: '', link: 'rfha', cls: 'c-rfha' },
  { key: 'ztsfDealId', label: 'Deal ID', type: 'text', group: 'ext' },
  { key: 'xtext', label: 'Transaction Text', type: 'text', group: 'ext' },
  { key: 'kontrh', label: 'Business Partner', type: 'text', group: 'ext' },
  { key: 'bpName', label: 'Partner Name', type: 'text', group: 'ext' },
  { key: 'sgsart', label: 'Product Type', type: 'text', group: 'ext' },
  { key: 'cpair', label: 'Currency Pair', type: 'text', group: 'ext' },
  { key: 'bsBu', label: 'Buy/Sell', type: 'text', group: 'ext' },
  { key: 'dblfz', label: 'Start Date', type: 'date', group: 'ext', fmt: 'date' },
  { key: 'delfz', label: 'Maturity Date', type: 'date', group: 'ext', fmt: 'date' },
  { key: 'fAmt', label: 'Foreign Amount', type: 'num', group: 'ext', fmt: 'foreign' },
  { key: 'fCurr', label: 'Foreign Ccy', type: 'text', group: 'ext' },
  { key: 'cRate', label: 'Contract Rate', type: 'num', group: 'ext', fmt: 'rate4' },
  { key: 'ccAmt', label: 'Amount (USD)', type: 'num', group: 'ext', fmt: 'amount2' },
  { key: 'month', label: 'Exp Mth-yr', type: 'text', group: 'mtm', sortByMaturityMonth: true },
  { key: 'monat', label: 'Exp Mth', type: 'num', group: 'mtm' },
  { key: 'vSpot', label: 'Valuation Spot', type: 'num', group: 'mtm', fmt: 'rate4' },
  { key: 'vSwap', label: 'Valuation Swap', type: 'num', group: 'mtm', fmt: 'swap6' },
  { key: 'vRate', label: 'Valuation Rate', type: 'num', group: 'mtm', fmt: 'rate4' },
  { key: 'vAmt', label: 'Valuation Amount (USD)', type: 'num', group: 'mtm', fmt: 'amount2' },
  { key: 'vGl', label: 'Valuation Gain/Loss (USD)', type: 'num', group: 'mtm', fmt: 'amount2', signed: true },
  { key: 'mtmDoc', label: 'MTM Doc', type: 'text', group: 'mtm', link: 'mtm' },
  { key: 'revDoc', label: 'Reversal Doc', type: 'text', group: 'mtm', link: 'rev' },
  { key: 'msg', label: 'Message', type: 'text', group: 'mtm', msgOk: true },
  { key: 'prctr', label: 'Profit Center', type: 'text', group: 'ext' },
  { key: 'rbusa', label: 'Business Area', type: 'text', group: 'ext' },
  { key: 'txnStatus', label: 'Txn Status', type: 'text', group: 'ext' },
]
