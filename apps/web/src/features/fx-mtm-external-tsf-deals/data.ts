import type { Column, Company, DealSeed, ExtFx, LayoutOption, Pair, Partner } from './types.ts'

/*
 * All of this screen's demo data and constants. Nothing here comes from SAP: the book of deals,
 * the counterparties and the market parameters are the original page's dummy values.
 */

/** Texts from the ABAP text pool (TEXT-1xx). */
export const TEXTS = {
  /** TEXT-115 */
  keyDateMonthEnd: 'Key Date Should be Month End Date only',
  /** TEXT-127 (spelling as in the SAP text pool) */
  posted: 'Document Posted Sucessfully',
  /** TEXT-113 */
  accNotMaintained: 'Account Value is not maintained.',
  /** TEXT-126 */
  title: 'FX MTM - External and TSF deals - SG00',
} as const

/** Company codes allowed for MTM (setleaf TRM_MTM_COMPANY_CODE). */
export const COMPANIES: readonly Company[] = [
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL', localCurrency: '' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd', entity: 'OTL', localCurrency: 'THB' },
  { code: 'VN10', name: 'Olam Vietnam Limited', entity: 'OVL', localCurrency: '' },
]

/** Counterparties (BUT000) with the country of the linked vendor (LFA1/T005T). */
export const PARTNERS: readonly Partner[] = [
  { id: '1000000101', name: 'HSBC Bank India', country: 'India' },
  { id: '1000000102', name: 'Citibank N.A. India', country: 'India' },
  { id: '1000000103', name: 'Standard Chartered Bank Singapore', country: 'Singapore' },
  { id: '1000000104', name: 'JPMorgan Chase Bank, N.A.', country: 'United States' },
  { id: '1000000105', name: 'Deutsche Bank AG', country: 'Germany' },
  { id: '1000000106', name: 'DBS Bank Ltd', country: 'Singapore' },
  { id: '1000000107', name: 'Bangkok Bank PCL', country: 'Thailand' },
  { id: '1000000108', name: 'Kasikornbank PCL', country: 'Thailand' },
  { id: '1000000109', name: 'Joint Stock Commercial Bank for Foreign Trade of Vietnam', country: 'Viet Nam' },
  { id: '1000000110', name: 'State Bank of India', country: 'India' },
  { id: '1000000111', name: 'MUFG Bank Ltd', country: 'Japan' },
]

/**
 * ZSGTRMTR_CURPAIR rows with USD on one side. base/trend/phase drive the deterministic mock
 * market; perYear is the annual forward points.
 */
export const PAIRS: readonly Pair[] = [
  { code: 'USD-INR', f: 'USD', t: 'INR', base: 89.6, trend: 0.00006, phase: 0.4, dp: 4, perYear: 2.1 },
  { code: 'USD-THB', f: 'USD', t: 'THB', base: 34.85, trend: -0.00001, phase: 1.7, dp: 4, perYear: -0.55 },
  { code: 'USD-VND', f: 'USD', t: 'VND', base: 26250.0, trend: 0.000035, phase: 2.6, dp: 2, perYear: 640.0 },
  { code: 'USD-SGD', f: 'USD', t: 'SGD', base: 1.286, trend: -0.000008, phase: 3.1, dp: 5, perYear: -0.019 },
  { code: 'EUR-USD', f: 'EUR', t: 'USD', base: 1.174, trend: 0.000006, phase: 4.2, dp: 5, perYear: 0.0165 },
  { code: 'GBP-USD', f: 'GBP', t: 'USD', base: 1.342, trend: 0.000004, phase: 5.0, dp: 5, perYear: 0.007 },
]

/** Dummy ALV layout variants (P_LAYOUT value help). Real variants are read from LTDX. */
export const LAYOUTS: readonly LayoutOption[] = [
  { id: '', text: 'Default layout' },
  { id: '/FULL', text: '/FULL  All columns' },
  { id: '/VALUATION', text: '/VALUATION  Valuation view' },
]

/** Dummy status descriptions for EXT_STAT_DESC ("<code> - <description>"). */
export const STATUSES: Readonly<Record<string, string>> = { '03': 'Confirmed', '04': 'Fixed', '08': 'Amended' }

/** ZSGTRMTR_EXT_FX: product / transaction-type combinations. */
export const EXT_FX: readonly ExtFx[] = [
  { zsgsart: '12F', zsfhaart: '620', ztsf: '' },
  { zsgsart: '12F', zsfhaart: '625', ztsf: 'X' },
  { zsgsart: '12D', zsfhaart: '630', ztsf: '' },
  { zsgsart: '12D', zsfhaart: '631', ztsf: 'X' },
]

export const TXN_TYPE_TEXT: Readonly<Record<string, string>> = {
  '620': 'FX Forward',
  '625': 'FX Forward - TSF',
  '630': 'FX NDF Forward',
  '631': 'FX NDF - TSF',
}

/** TEXT-104 / TEXT-105 */
export const ACC_CATEGORIES: Readonly<Record<string, string>> = { FV: 'Fair Value', CT: 'Cash Traded' }

/** Profit centre and business area per company, used when the accounting table leaves them blank. */
export const PROFIT_CENTERS: Readonly<Record<string, string>> = { IN11: 'PC_IN1101', TH10: 'PC_TH1001', VN10: 'PC_VN1001' }
export const BUSINESS_AREAS: Readonly<Record<string, string>> = { IN11: 'IN01', TH10: 'TH01', VN10: 'VN01' }

/** The system date of the demo (05-10-2026): an NDF only has a settlement rate once its fixing date has passed. */
export const SYSTEM_DATE = '20261005'

export const SWAP_TENORS: readonly number[] = [30, 60, 90, 120, 150, 180, 240, 270, 300, 365, 450, 545, 730, 1095]

/** T247-KTX */
export const MONTH_SHORT: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** TVARVC ZSGTRMFM_MTM_SWAP (dummy value). */
export const MTM_WINDOW_DAYS = 15
export const MTM_MAX_MONTHS = 60

/** First accounting document number handed out by the mock BAPI. */
export const FIRST_DOC_NO = 4900016500

/** Where the screen opens: company, key date (a month end), posting type and layout. */
export const DEFAULTS = { bukrs: 'IN11', keyDate: '30-09-2026', posting: 'view', layout: '' } as const

export const PAGE_SIZES: readonly number[] = [10, 20, 50]
export const DEFAULT_PAGE_SIZE = 20

/** Deals already posted when the demo opens, so it starts with realistic history. */
export const POSTED_HISTORY: readonly { bukrs: string; keyYmd: string; rfhas: readonly string[] }[] = [
  { bukrs: 'IN11', keyYmd: '20260831', rfhas: ['3000014801', '3000014803', '3000014806', '3000014808'] },
  { bukrs: 'IN11', keyYmd: '20260930', rfhas: ['3000014801', '3000014812'] },
  { bukrs: 'TH10', keyYmd: '20260930', rfhas: ['3000024801'] },
  { bukrs: 'VN10', keyYmd: '20260930', rfhas: ['3000034801'] },
]

/**
 * ALV field catalogue. layouts: d = default layout, f = full layout, v = valuation layout;
 * group: ext = grey "Transaction Data - External", mtm = blue "MTM Data".
 */
export const COLUMNS: readonly Column[] = [
  { key: 'rfha', label: 'Deal No', type: 'link', action: 'deal', layouts: 'dfv' },
  { key: 'ext_stat_desc', label: 'Status', type: 'status', layouts: 'dfv' },
  { key: 'tsf_code', label: 'Source', type: 'text', layouts: 'df' },
  { key: 'bukrs', label: 'Co. Code', type: 'text', layouts: 'f' },
  { key: 'butxt', label: 'Company', type: 'text', layouts: 'f' },
  { key: 'kontrh', label: 'Counterparty', type: 'text', layouts: 'f' },
  { key: 'bp_name', label: 'Counterparty Name', type: 'text', layouts: 'df' },
  { key: 'landx50', label: 'Country', type: 'text', layouts: 'f' },
  { key: 'xtext', label: 'Txn Type', type: 'text', layouts: 'df' },
  { key: 'sfhaart', label: 'Trans. Type', type: 'text', layouts: 'f' },
  { key: 'sgsart', label: 'Product Type', type: 'text', layouts: 'f' },
  { key: 'dblfz', label: 'Trade Date', type: 'date', layouts: 'df' },
  { key: 'delfz', label: 'Value Date', type: 'date', layouts: 'dfv' },
  { key: 'month', label: 'Exp Mth-yr', type: 'text', sortKey: 'delfz', layouts: 'df' },
  { key: 'monat', label: 'Exp Mth', type: 'num', layouts: 'f' },
  { key: 'cpair', label: 'Currency Pair', type: 'text', layouts: 'dfv' },
  { key: 'bs_bu', label: 'Buy/Sell', type: 'text', layouts: 'df' },
  { key: 'bs_1', label: 'BS1-OCB', type: 'text', layouts: 'f' },
  { key: 'bs_2', label: 'BS2-OCB', type: 'text', layouts: 'f' },
  { key: 'curr1', label: 'Curr 1', type: 'text', layouts: 'f' },
  { key: 'amt1', label: 'Amount 1', type: 'amt', layouts: 'f' },
  { key: 'curr2', label: 'Curr 2', type: 'text', layouts: 'f' },
  { key: 'amt2', label: 'Amount 2', type: 'amt', layouts: 'f' },
  { key: 'f_curr', label: 'Foreign Curr', type: 'text', group: 'ext', layouts: 'dfv' },
  { key: 'f_amt', label: 'Foreign Amount', type: 'amt', group: 'ext', layouts: 'dfv' },
  { key: 'usd_amt', label: 'Amount in USD', type: 'amt', group: 'ext', layouts: 'dfv' },
  { key: 'c_rate_n', label: 'Contract Rate', type: 'rate', group: 'ext', layouts: 'dfv' },
  { key: 'ndf_date', label: 'NDF Fixing Date', type: 'date', group: 'ext', layouts: 'df' },
  { key: 'ndf_rate', label: 'NDF Settlement Rate', type: 'rate', blankZero: true, group: 'ext', layouts: 'df' },
  { key: 'ndf_ref', label: 'NDF Ref', type: 'text', group: 'ext', layouts: 'f' },
  { key: 'zsett_pair', label: 'Sett Curr Pair', type: 'text', group: 'ext', layouts: 'f' },
  { key: 'v_spot_n', label: 'Value Spot', type: 'rate', group: 'mtm', layouts: 'dfv' },
  { key: 'v_swap_n', label: 'Value Swap', type: 'swap', group: 'mtm', layouts: 'dfv' },
  { key: 'v_rate_n', label: 'Value Rate', type: 'rate', group: 'mtm', layouts: 'dfv' },
  { key: 'v_amt', label: 'Value Amt', type: 'amt', group: 'mtm', layouts: 'dfv' },
  { key: 'v_gl', label: 'Val Gain/Loss', type: 'gl', group: 'mtm', layouts: 'dfv' },
  { key: 'v_gl_th', label: 'Val Gain/Loss THB', type: 'gl', group: 'mtm', layouts: 'dfv', thOnly: true },
  { key: 'mtm_doc', label: 'MTM Doc', type: 'link', action: 'doc', group: 'mtm', layouts: 'dfv' },
  { key: 'rev_doc', label: 'Rev Doc', type: 'link', action: 'doc', group: 'mtm', layouts: 'dfv' },
  { key: 'msg', label: 'Message', type: 'text', group: 'mtm', layouts: 'dfv' },
  { key: 'prctr', label: 'Profit Center', type: 'text', layouts: 'f' },
  { key: 'rbusa', label: 'Business Area', type: 'text', layouts: 'f' },
  { key: 'xportb', label: 'Accounting Cat. Des', type: 'text', layouts: 'f' },
  { key: 'refer', label: 'Trade Cat. Code', type: 'text', layouts: 'f' },
  { key: 'ztsf_deal_id', label: 'TSF Deal ID', type: 'text', layouts: 'f' },
  { key: 'zolam_deal_no', label: 'Olam Deal No', type: 'text', layouts: 'f' },
]

/**
 * Every deal in the system (zsgtsfcds_fx / zsgtsfcds_fx_trm); the engine keeps those active at
 * the key date (trade date <= key date < value date). Positional, in this order: deal no,
 * company, source, DE code, status, partner, pair, side of leg 1, notional of leg 1, trade
 * date, value date, kind, accounting category. The order matters: the contract-rate jitter is
 * seeded by each deal's position in this list.
 */
export const DEAL_SEEDS: readonly DealSeed[] = [
  /* ---------------- IN11 : Olam Agri India ---------------- */
  ['3000014801', 'IN11', 'TSF', 'DE6', '03', '1000000101', 'USD-INR', 'Sell', 4500000, '20260212', '20261027', 'FWD', 'FV'],
  ['3000014802', 'IN11', 'TSF', 'DE6', '03', '1000000102', 'USD-INR', 'Buy', 2750000, '20260305', '20261130', 'FWD', 'CT'],
  ['3000014803', 'IN11', 'TRM', 'DE2', '03', '1000000110', 'USD-INR', 'Sell', 6000000, '20260318', '20261229', 'FWD', 'FV'],
  ['3000014804', 'IN11', 'TRM', 'DE2', '03', '1000000104', 'USD-INR', 'Buy', 1800000, '20260402', '20270128', 'FWD', 'CT'],
  ['3000014805', 'IN11', 'TSF', 'DE6', '04', '1000000101', 'USD-INR', 'Sell', 3200000, '20260415', '20270226', 'FWD', 'FV'],
  ['3000014806', 'IN11', 'TRM', 'DE6', '03', '1000000105', 'USD-INR', 'Sell', 5250000, '20260429', '20260930', 'FWD', 'FV'],
  ['3000014807', 'IN11', 'TSF', 'DE2', '03', '1000000102', 'USD-INR', 'Buy', 2100000, '20260511', '20270331', 'FWD', 'CT'],
  ['3000014808', 'IN11', 'TRM', 'DE6', '03', '1000000110', 'USD-INR', 'Sell', 7500000, '20260520', '20260828', 'FWD', 'FV'],
  ['3000014809', 'IN11', 'TSF', 'DE6', '03', '1000000103', 'USD-INR', 'Buy', 1500000, '20260603', '20261215', 'FWD', 'CT'],
  ['3000014810', 'IN11', 'TRM', 'DE2', '08', '1000000104', 'USD-INR', 'Sell', 4000000, '20260617', '20270430', 'FWD', 'FV'],
  ['3000014811', 'IN11', 'TSF', 'DE6', '03', '1000000101', 'USD-INR', 'Sell', 2900000, '20260702', '20261026', 'FWD', 'CT'],
  ['3000014812', 'IN11', 'TRM', 'DE6', '03', '1000000111', 'USD-INR', 'Buy', 3600000, '20260716', '20270528', 'FWD', 'FV'],
  ['3000014813', 'IN11', 'TSF', 'DE6', '04', '1000000110', 'USD-INR', 'Sell', 5000000, '20260804', '20261130', 'FWD', 'FV'],
  ['3000014814', 'IN11', 'TRM', 'DE2', '03', '1000000102', 'USD-INR', 'Buy', 2400000, '20260819', '20270629', 'FWD', 'CT'],
  ['3000014815', 'IN11', 'TSF', 'DE6', '03', '1000000105', 'USD-INR', 'Sell', 6800000, '20260908', '20261231', 'FWD', 'FV'],
  /* NDFs  (USD-INR) : fixed before 30-09, fixed on 30-09, fixing still ahead of the key date */
  ['3000014816', 'IN11', 'TRM', 'DE6', '04', '1000000104', 'USD-INR', 'Sell', 3000000, '20260610', '20261001', 'NDF', 'FV'],
  ['3000014817', 'IN11', 'TSF', 'DE6', '04', '1000000101', 'USD-INR', 'Buy', 2200000, '20260625', '20261002', 'NDF', 'FV'],
  ['3000014818', 'IN11', 'TRM', 'DE6', '03', '1000000110', 'USD-INR', 'Sell', 4100000, '20260714', '20261006', 'NDF', 'FV'],
  ['3000014819', 'IN11', 'TSF', 'DE6', '03', '1000000102', 'USD-INR', 'Sell', 2600000, '20260811', '20261109', 'NDF', 'FV'],
  ['3000014820', 'IN11', 'TRM', 'DE2', '03', '1000000103', 'USD-INR', 'Buy', 1900000, '20260901', '20270115', 'NDF', 'FV'],
  /* other pairs */
  ['3000014821', 'IN11', 'TRM', 'DE6', '03', '1000000105', 'EUR-USD', 'Buy', 1250000, '20260507', '20261130', 'FWD', 'FV'],
  ['3000014822', 'IN11', 'TSF', 'DE6', '03', '1000000104', 'EUR-USD', 'Sell', 950000, '20260622', '20270129', 'FWD', 'CT'],
  ['3000014823', 'IN11', 'TRM', 'DE2', '03', '1000000105', 'EUR-USD', 'Sell', 1600000, '20260818', '20261230', 'FWD', 'FV'],
  ['3000014824', 'IN11', 'TRM', 'DE6', '03', '1000000104', 'GBP-USD', 'Buy', 800000, '20260710', '20261130', 'FWD', 'CT'],
  ['3000014825', 'IN11', 'TSF', 'DE6', '03', '1000000106', 'USD-SGD', 'Sell', 1200000, '20260721', '20261028', 'FWD', 'FV'],
  /* ---------------- TH10 : Olam (Thailand) ---------------- */
  ['3000024801', 'TH10', 'TSF', 'DE6', '03', '1000000107', 'USD-THB', 'Sell', 3800000, '20260220', '20261029', 'FWD', 'FV'],
  ['3000024802', 'TH10', 'TRM', 'DE2', '03', '1000000108', 'USD-THB', 'Buy', 2250000, '20260312', '20261127', 'FWD', 'CT'],
  ['3000024803', 'TH10', 'TSF', 'DE2', '03', '1000000107', 'USD-THB', 'Sell', 5100000, '20260326', '20261228', 'FWD', 'FV'],
  ['3000024804', 'TH10', 'TRM', 'DE6', '04', '1000000103', 'USD-THB', 'Sell', 2750000, '20260408', '20270129', 'FWD', 'FV'],
  ['3000024805', 'TH10', 'TSF', 'DE6', '03', '1000000108', 'USD-THB', 'Buy', 1400000, '20260505', '20260930', 'FWD', 'CT'],
  ['3000024806', 'TH10', 'TRM', 'DE2', '03', '1000000104', 'USD-THB', 'Sell', 4300000, '20260519', '20270226', 'FWD', 'FV'],
  ['3000024807', 'TH10', 'TSF', 'DE6', '03', '1000000107', 'USD-THB', 'Sell', 3000000, '20260609', '20270331', 'FWD', 'FV'],
  ['3000024808', 'TH10', 'TRM', 'DE2', '03', '1000000108', 'USD-THB', 'Buy', 1950000, '20260701', '20261030', 'FWD', 'CT'],
  ['3000024809', 'TH10', 'TSF', 'DE2', '08', '1000000106', 'USD-THB', 'Sell', 2600000, '20260722', '20261130', 'FWD', 'FV'],
  ['3000024810', 'TH10', 'TRM', 'DE6', '03', '1000000107', 'USD-THB', 'Sell', 4700000, '20260811', '20270430', 'FWD', 'FV'],
  ['3000024811', 'TH10', 'TSF', 'DE2', '03', '1000000103', 'USD-THB', 'Buy', 2000000, '20260903', '20261231', 'FWD', 'CT'],
  ['3000024812', 'TH10', 'TRM', 'DE6', '03', '1000000105', 'EUR-USD', 'Buy', 900000, '20260515', '20261127', 'FWD', 'FV'],
  ['3000024813', 'TH10', 'TSF', 'DE2', '03', '1000000104', 'EUR-USD', 'Sell', 1100000, '20260729', '20270129', 'FWD', 'CT'],
  ['3000024814', 'TH10', 'TRM', 'DE6', '03', '1000000106', 'USD-SGD', 'Buy', 700000, '20260630', '20261029', 'FWD', 'FV'],
  /* ---------------- VN10 : Olam Vietnam ---------------- */
  ['3000034801', 'VN10', 'TSF', 'DE6', '03', '1000000109', 'USD-VND', 'Sell', 4200000, '20260225', '20261029', 'FWD', 'FV'],
  ['3000034802', 'VN10', 'TRM', 'DE6', '03', '1000000109', 'USD-VND', 'Sell', 3500000, '20260401', '20261130', 'FWD', 'CT'],
  ['3000034803', 'VN10', 'TRM', 'DE6', '03', '1000000104', 'USD-VND', 'Buy', 2800000, '20260514', '20261231', 'FWD', 'CT'],
  ['3000034804', 'VN10', 'TSF', 'DE6', '04', '1000000109', 'USD-VND', 'Sell', 5600000, '20260610', '20270129', 'FWD', 'FV'],
  ['3000034805', 'VN10', 'TRM', 'DE6', '03', '1000000103', 'USD-VND', 'Buy', 1700000, '20260728', '20270226', 'FWD', 'CT'],
  ['3000034806', 'VN10', 'TRM', 'DE6', '04', '1000000109', 'USD-VND', 'Sell', 3300000, '20260706', '20261001', 'NDF', 'FV'],
  ['3000034807', 'VN10', 'TSF', 'DE6', '03', '1000000104', 'USD-VND', 'Buy', 2400000, '20260817', '20261105', 'NDF', 'FV'],
  ['3000034808', 'VN10', 'TRM', 'DE6', '03', '1000000105', 'EUR-USD', 'Sell', 600000, '20260612', '20261230', 'FWD', 'FV'],
  ['3000034809', 'VN10', 'TRM', 'DE6', '03', '1000000106', 'USD-SGD', 'Buy', 550000, '20260803', '20261126', 'FWD', 'CT'],
]
