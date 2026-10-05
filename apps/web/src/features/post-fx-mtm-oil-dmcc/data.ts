import type {
  AccConfig,
  BusinessPartner,
  ColumnDef,
  ColumnKey,
  CompanyCode,
  CurrencyPair,
  DealSpec,
  Layout,
  SwapPoint,
} from './types.ts'

/** The key date the form opens on, and the page sizes the footer offers. */
export const INITIAL_KEY_DATE = '2026-09-30'
export const PAGE_SIZES = [8, 12, 20] as const
export const DEFAULT_PAGE_SIZE = 20
/** Next document number the mock number range hands out (the first posting takes +1). */
export const INITIAL_NEXT_DOC = 1900004800

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const
export const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

/** Authorised company codes (T001 filtered by F_BKPF_BUK activity 03). */
export const COMPANY_CODES: readonly CompanyCode[] = [
  { code: 'SG11', name: 'Olam International Limited', prctr: 'PC-SG11-TRS', pcName: 'Treasury Singapore', rbusa: 'T110', baName: 'Group Treasury' },
  { code: 'SG12', name: 'Olam Global Agri Pte. Ltd.', prctr: 'PC-SG12-TRS', pcName: 'Treasury OGA', rbusa: 'T120', baName: 'Agri Treasury' },
  { code: 'AE10', name: 'Olam Agri DMCC', prctr: 'PC-AE10-TRS', pcName: 'Treasury Dubai', rbusa: 'T130', baName: 'Middle East Treasury' },
]

export const BUSINESS_PARTNERS: readonly BusinessPartner[] = [
  { id: '0000100231', name: 'HSBC Bank (Singapore) Ltd' },
  { id: '0000100245', name: 'Citibank N.A., Singapore Branch' },
  { id: '0000100267', name: 'Standard Chartered Bank' },
  { id: '0000100288', name: 'JPMorgan Chase Bank N.A.' },
  { id: '0000100312', name: 'Deutsche Bank AG' },
  { id: '0000100334', name: 'DBS Bank Ltd' },
  { id: '0000100359', name: 'Emirates NBD Bank PJSC' },
]

/** Product types. The 3rd character 'D' marks an NDF (SGSART+2(1) = 'D'). */
export const PRODUCT_TYPES: Readonly<Record<string, string>> = {
  '600': 'FX Forward - Deliverable',
  '60D': 'FX Forward - NDF',
}

/** ZSGTRMTR_CURPAIR rows with USD on one side (drives the Currency Pair listbox). */
export const CURRENCY_PAIRS: readonly CurrencyPair[] = [
  { pair: 'USD/INR', f: 'USD', t: 'INR' },
  { pair: 'EUR/USD', f: 'EUR', t: 'USD' },
  { pair: 'GBP/USD', f: 'GBP', t: 'USD' },
  { pair: 'USD/SGD', f: 'USD', t: 'SGD' },
  { pair: 'USD/CNH', f: 'USD', t: 'CNH' },
  { pair: 'AUD/USD', f: 'AUD', t: 'USD' },
  { pair: 'USD/JPY', f: 'USD', t: 'JPY' },
  { pair: 'USD/THB', f: 'USD', t: 'THB' },
]

/** TVARVC ZTSFMTM_STAT: transaction statuses excluded from the report. */
export const EXCLUDED_TXN_STATUSES: readonly string[] = ['40']

/** Spot rates (CDS ZSGTRMCDS_SPOT_MAIN, rate type MTM) per key date. */
export const SPOT_RATES_BY_DATE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  '2026-06-30': { 'USD/INR': 87.1, 'EUR/USD': 1.152, 'GBP/USD': 1.319, 'USD/SGD': 1.2905, 'USD/CNH': 7.205, 'AUD/USD': 0.654 },
  '2026-07-31': { 'USD/INR': 87.62, 'EUR/USD': 1.159, 'GBP/USD': 1.328, 'USD/SGD': 1.286, 'USD/CNH': 7.184, 'AUD/USD': 0.659 },
  '2026-08-31': { 'USD/INR': 88.35, 'EUR/USD': 1.1655, 'GBP/USD': 1.3395, 'USD/SGD': 1.279, 'USD/CNH': 7.152, 'AUD/USD': 0.6645 },
  '2026-09-30': { 'USD/INR': 88.9, 'EUR/USD': 1.171, 'GBP/USD': 1.344, 'USD/SGD': 1.2745, 'USD/CNH': 7.129, 'AUD/USD': 0.668 },
}

/** Swap-point curves (CDS ZSGTRMCDS_SWAP_MAIN): tenor in months to swap points. */
export const SWAP_CURVES: Readonly<Record<string, readonly SwapPoint[]>> = {
  'USD/INR': [[1, 0.3], [3, 0.95], [6, 1.9], [12, 3.8], [24, 7.5], [36, 11.0], [60, 17.2]],
  'EUR/USD': [[1, 0.0006], [3, 0.0018], [6, 0.0036], [12, 0.0072], [24, 0.014], [36, 0.02], [60, 0.031]],
  'GBP/USD': [[1, 0.0003], [3, 0.0009], [6, 0.0018], [12, 0.0035], [24, 0.0068], [36, 0.0095], [60, 0.014]],
  'USD/SGD': [[1, -0.0012], [3, -0.0036], [6, -0.0071], [12, -0.0135], [24, -0.025], [36, -0.034], [60, -0.048]],
  'USD/CNH': [[1, -0.006], [3, -0.018], [6, -0.036], [12, -0.07], [24, -0.13], [36, -0.18], [60, -0.26]],
  'AUD/USD': [[1, -0.0001], [3, -0.0003], [6, -0.0006], [12, -0.0011], [24, -0.0021], [36, -0.003], [60, -0.0045]],
}

type AccKind = { d: string; c: string; h: string; dd: string; dc: string }

const ACC_GL: Readonly<Record<'ML' | 'MG', { fwd: AccKind; ndf: AccKind }>> = {
  ML: {
    fwd: { d: '7810010', c: '2410010', h: 'FX MTM Loss', dd: 'MTM Loss', dc: 'MTM Liability' },
    ndf: { d: '7810020', c: '2410020', h: 'FX NDF MTM Loss', dd: 'NDF MTM Loss', dc: 'NDF MTM Liability' },
  },
  MG: {
    fwd: { d: '1410010', c: '8810010', h: 'FX MTM Gain', dd: 'MTM Asset', dc: 'MTM Gain' },
    ndf: { d: '1410020', c: '8810020', h: 'FX NDF MTM Gain', dd: 'NDF MTM Asset', dc: 'NDF MTM Gain' },
  },
}

/**
 * ZSGTRMTR_ACC_TBL (INT_EXT = 'T'): posting accounts per company code, gain/loss type (MG / ML) and
 * NDF flag. Blank PC / BA fall back to the transaction's own profit centre / business area.
 */
export const ACC_CONFIG: readonly AccConfig[] = COMPANY_CODES.flatMap((cc) =>
  (['ML', 'MG'] as const).flatMap((type) =>
    (
      [
        ['', 'fwd'],
        ['X', 'ndf'],
      ] as const
    ).map(([zndf, kind]): AccConfig => {
      const g = ACC_GL[type][kind]
      return {
        zbukrs: cc.code,
        int_ext: 'T',
        type,
        zndf,
        gl_debit: g.d,
        gl_credit: g.c,
        pc_debit: '',
        pc_credit: '',
        ba_debit: '',
        ba_credit: '',
        doc_header: g.h,
        doc_debit: g.dd,
        doc_credit: g.dc,
      }
    }),
  ),
)

/** Posting periods (yyyy-mm) that are closed per company code; posting into one simulates a BAPI error. */
export const CLOSED_PERIODS: Readonly<Record<string, readonly string[]>> = { AE10: ['2026-09'] }

/** Previously posted month-ends: every second valued deal is already posted, numbering from the base. */
export const SEEDED_MONTH_ENDS: readonly (readonly [keyDate: string, baseDoc: number])[] = [
  ['2026-07-31', 1900003100],
  ['2026-08-31', 1900004100],
]

/** A couple of postings already done for the latest month-end: company, transaction, document number. */
export const SEEDED_LATEST_POSTINGS: readonly (readonly [bukrs: string, rfha: string, doc: number])[] = [
  ['SG11', 'FX2026000106', 1900004600],
  ['SG12', 'FX2026000204', 1900004602],
]
export const SEEDED_LATEST_KEY_DATE = '2026-09-30'

/**
 * FX transactions behind view ZSGTSFV_FX. Dependent fields (company name, partner name, legs,
 * buy/sell, profit centre ...) are derived from the lookups above.
 */
export const DEAL_SPECS: readonly DealSpec[] = [
  // SG11 - Olam International Limited
  { bukrs: 'SG11', rfha: 'FX2026000101', bp: '0000100245', sgsart: '600', pair: 'USD/INR', side: 'Buy', amt: 5000000, rate: 89.25, trade: '2026-06-12', value: '2026-12-15', st: '20', ext: 'CITI-260612-0418' },
  { bukrs: 'SG11', rfha: 'FX2026000102', bp: '0000100334', sgsart: '600', pair: 'USD/INR', side: 'Sell', amt: 3000000, rate: 90.15, trade: '2026-07-08', value: '2027-03-15', st: '20', ext: 'DBS-260708-0231' },
  { bukrs: 'SG11', rfha: 'FX2026000103', bp: '0000100231', sgsart: '60D', pair: 'USD/INR', side: 'Buy', amt: 8500000, rate: 89.8, trade: '2026-08-04', value: '2026-11-27', st: '20', ext: 'HSBC-260804-0097' },
  { bukrs: 'SG11', rfha: 'FX2026000104', bp: '0000100288', sgsart: '600', pair: 'EUR/USD', side: 'Buy', amt: 2400000, rate: 1.1735, trade: '2026-05-20', value: '2026-12-10', st: '20', ext: 'JPM-260520-1182' },
  { bukrs: 'SG11', rfha: 'FX2026000105', bp: '0000100312', sgsart: '600', pair: 'EUR/USD', side: 'Sell', amt: 1750000, rate: 1.168, trade: '2026-08-18', value: '2027-02-26', st: '30', ext: 'DB-260818-0364' },
  { bukrs: 'SG11', rfha: 'FX2026000106', bp: '0000100267', sgsart: '600', pair: 'USD/SGD', side: 'Buy', amt: 4200000, rate: 1.269, trade: '2026-07-22', value: '2026-11-30', st: '20', ext: 'SCB-260722-0509' },
  { bukrs: 'SG11', rfha: 'FX2026000107', bp: '0000100245', sgsart: '600', pair: 'GBP/USD', side: 'Buy', amt: 1200000, rate: 1.3485, trade: '2026-09-02', value: '2027-01-29', st: '20', ext: 'CITI-260902-0652' },
  { bukrs: 'SG11', rfha: 'FX2026000108', bp: '0000100231', sgsart: '600', pair: 'USD/CNH', side: 'Sell', amt: 6000000, rate: 7.104, trade: '2026-06-30', value: '2027-03-31', st: '20', ext: 'HSBC-260630-0211' },
  { bukrs: 'SG11', rfha: 'FX2026000109', bp: '0000100334', sgsart: '600', pair: 'AUD/USD', side: 'Buy', amt: 2000000, rate: 0.6705, trade: '2026-09-14', value: '2026-12-18', st: '20', ext: 'DBS-260914-0318' },
  { bukrs: 'SG11', rfha: 'FX2026000110', bp: '0000100288', sgsart: '60D', pair: 'USD/INR', side: 'Sell', amt: 12000000, rate: 91.45, trade: '2026-04-15', value: '2027-04-14', st: '20', ext: 'JPM-260415-0775' },
  { bukrs: 'SG11', rfha: 'FX2026000111', bp: '0000100267', sgsart: '600', pair: 'USD/INR', side: 'Buy', amt: 2750000, rate: 89.05, trade: '2026-07-30', value: '2026-10-30', st: '20', ext: 'SCB-260730-0644' },
  { bukrs: 'SG11', rfha: 'FX2026000112', bp: '0000100312', sgsart: '600', pair: 'EUR/USD', side: 'Buy', amt: 900000, rate: 1.17, trade: '2026-03-02', value: '2026-08-26', st: '20', ext: 'DB-260302-0119' },
  // SG12 - Olam Global Agri Pte. Ltd.
  { bukrs: 'SG12', rfha: 'FX2026000201', bp: '0000100231', sgsart: '60D', pair: 'USD/INR', side: 'Buy', amt: 15000000, rate: 89.6, trade: '2026-08-11', value: '2026-12-22', st: '20', ext: 'HSBC-260811-0302' },
  { bukrs: 'SG12', rfha: 'FX2026000202', bp: '0000100245', sgsart: '60D', pair: 'USD/INR', side: 'Buy', amt: 9500000, rate: 90.3, trade: '2026-09-09', value: '2027-03-25', st: '20', ext: 'CITI-260909-0713' },
  { bukrs: 'SG12', rfha: 'FX2026000203', bp: '0000100288', sgsart: '600', pair: 'USD/SGD', side: 'Sell', amt: 5500000, rate: 1.281, trade: '2026-07-16', value: '2026-11-16', st: '20', ext: 'JPM-260716-0884' },
  { bukrs: 'SG12', rfha: 'FX2026000204', bp: '0000100312', sgsart: '600', pair: 'EUR/USD', side: 'Sell', amt: 3200000, rate: 1.176, trade: '2026-06-02', value: '2027-01-18', st: '20', ext: 'DB-260602-0156' },
  { bukrs: 'SG12', rfha: 'FX2026000205', bp: '0000100267', sgsart: '600', pair: 'GBP/USD', side: 'Sell', amt: 1850000, rate: 1.341, trade: '2026-08-25', value: '2026-12-28', st: '20', ext: 'SCB-260825-0467' },
  { bukrs: 'SG12', rfha: 'FX2026000206', bp: '0000100334', sgsart: '600', pair: 'AUD/USD', side: 'Sell', amt: 4100000, rate: 0.663, trade: '2026-05-12', value: '2027-02-12', st: '30', ext: 'DBS-260512-0092' },
  { bukrs: 'SG12', rfha: 'FX2026000207', bp: '0000100231', sgsart: '600', pair: 'USD/CNH', side: 'Buy', amt: 3600000, rate: 7.118, trade: '2026-09-21', value: '2026-11-23', st: '20', ext: 'HSBC-260921-0540' },
  { bukrs: 'SG12', rfha: 'FX2026000208', bp: '0000100245', sgsart: '600', pair: 'USD/INR', side: 'Sell', amt: 4800000, rate: 90.02, trade: '2026-08-26', value: '2026-10-28', st: '20', ext: 'CITI-260826-0825' },
  { bukrs: 'SG12', rfha: 'FX2026000209', bp: '0000100288', sgsart: '600', pair: 'EUR/USD', side: 'Buy', amt: 2100000, rate: 1.1715, trade: '2026-09-23', value: '2027-03-23', st: '20', ext: 'JPM-260923-0961' },
  // AE10 - Olam Agri DMCC
  { bukrs: 'AE10', rfha: 'FX2026000301', bp: '0000100359', sgsart: '60D', pair: 'USD/INR', side: 'Buy', amt: 7200000, rate: 89.9, trade: '2026-08-20', value: '2026-12-18', st: '20', ext: 'ENBD-260820-0173' },
  { bukrs: 'AE10', rfha: 'FX2026000302', bp: '0000100231', sgsart: '60D', pair: 'USD/INR', side: 'Sell', amt: 6400000, rate: 91.1, trade: '2026-06-18', value: '2027-02-26', st: '20', ext: 'HSBC-260618-0388' },
  { bukrs: 'AE10', rfha: 'FX2026000303', bp: '0000100245', sgsart: '600', pair: 'EUR/USD', side: 'Buy', amt: 1350000, rate: 1.169, trade: '2026-09-01', value: '2026-12-01', st: '20', ext: 'CITI-260901-0227' },
  { bukrs: 'AE10', rfha: 'FX2026000304', bp: '0000100267', sgsart: '600', pair: 'GBP/USD', side: 'Buy', amt: 950000, rate: 1.347, trade: '2026-07-09', value: '2026-11-09', st: '20', ext: 'SCB-260709-0316' },
  { bukrs: 'AE10', rfha: 'FX2026000305', bp: '0000100288', sgsart: '600', pair: 'USD/SGD', side: 'Buy', amt: 2900000, rate: 1.272, trade: '2026-09-16', value: '2027-01-15', st: '20', ext: 'JPM-260916-0603' },
  { bukrs: 'AE10', rfha: 'FX2026000306', bp: '0000100312', sgsart: '600', pair: 'USD/INR', side: 'Buy', amt: 3400000, rate: 89.45, trade: '2026-05-27', value: '2026-10-26', st: '20', ext: 'DB-260527-0148' },
  // Never listed: excluded by TVARVC status / inactive (SAKTIV = 3)
  { bukrs: 'SG11', rfha: 'FX2026000401', bp: '0000100231', sgsart: '600', pair: 'EUR/USD', side: 'Buy', amt: 500000, rate: 1.165, trade: '2026-06-01', value: '2027-01-05', st: '40', ext: 'HSBC-260601-0044' },
  { bukrs: 'SG12', rfha: 'FX2026000402', bp: '0000100334', sgsart: '600', pair: 'USD/SGD', side: 'Sell', amt: 800000, rate: 1.29, trade: '2026-06-01', value: '2027-01-05', st: '20', saktiv: '3', ext: 'DBS-260601-0045' },
]

/** ALV field catalogue. */
export const COLUMNS: Readonly<Record<ColumnKey, ColumnDef>> = {
  bukrs: { label: 'Company Code', type: 'text' },
  butxt: { label: 'Company Name', type: 'text' },
  rfha: { label: 'Transaction', type: 'text', link: 'txn', pin: true },
  nordext: { label: 'Ext. Reference', type: 'text' },
  ztsf_deal_id: { label: 'TSF Deal ID', type: 'text' },
  zolam_deal_no: { label: 'Olam Deal No', type: 'text' },
  kontrh: { label: 'Business Partner', type: 'text' },
  bp_name: { label: 'Partner Name', type: 'text' },
  sgsart: { label: 'Product Type', type: 'text' },
  xtext: { label: 'Transaction Type', type: 'text' },
  cpair: { label: 'Currency Pair', type: 'text' },
  bs_bu: { label: 'Buy/Sell', type: 'text' },
  dblfz: { label: 'Trade Date', type: 'date' },
  delfz: { label: 'Value Date', type: 'date' },
  month: { label: 'Exp Mth-yr', type: 'text', grp: 'mtm', sortKey: 'delfz' },
  monat: { label: 'Exp Mth', type: 'num', grp: 'mtm' },
  f_amt: { label: 'Foreign Amount', type: 'amt', grp: 'ext' },
  f_curr: { label: 'Foreign Curr.', type: 'text', grp: 'ext' },
  c_rate: { label: 'All-in Rate', type: 'rate', grp: 'ext' },
  usd_amt: { label: 'USD Amount', type: 'amt', grp: 'ext' },
  v_spot: { label: 'Valuation Spot', type: 'rate', grp: 'mtm' },
  v_swap: { label: 'Valuation Swap', type: 'rate', grp: 'mtm' },
  v_rate: { label: 'Valuation Rate', type: 'rate', grp: 'mtm' },
  v_amt: { label: 'Valuation Amount (USD)', type: 'amt', grp: 'mtm' },
  v_gl: { label: 'Valuation Gain/Loss (USD)', type: 'amt', grp: 'mtm' },
  mtm_doc: { label: 'MTM Doc. No.', type: 'text', grp: 'mtm', link: 'doc' },
  rev_doc: { label: 'MTM Rev. Doc. No.', type: 'text', grp: 'mtm', link: 'doc' },
  msg: { label: 'Remarks', type: 'text', grp: 'mtm' },
}

/**
 * ASSUMPTION (as in the original): real ALV layout variants are read from the SAP layout table
 * (REUSE_ALV_VARIANT_F4). These three are dummy variants.
 */
export const LAYOUTS: readonly Layout[] = [
  {
    id: '',
    label: 'Default layout',
    cols: ['rfha', 'bukrs', 'bp_name', 'xtext', 'cpair', 'bs_bu', 'dblfz', 'delfz', 'month', 'monat',
      'f_amt', 'f_curr', 'c_rate', 'usd_amt', 'v_spot', 'v_swap', 'v_rate', 'v_amt', 'v_gl', 'mtm_doc', 'rev_doc', 'msg'],
  },
  {
    id: 'VALUATION',
    label: 'Valuation summary',
    cols: ['rfha', 'bukrs', 'bp_name', 'cpair', 'bs_bu', 'delfz', 'f_amt', 'f_curr', 'c_rate', 'usd_amt', 'v_rate', 'v_amt', 'v_gl', 'mtm_doc', 'rev_doc'],
  },
  {
    id: 'ALL',
    label: 'All fields',
    cols: ['rfha', 'bukrs', 'butxt', 'nordext', 'ztsf_deal_id', 'zolam_deal_no', 'kontrh', 'bp_name', 'sgsart', 'xtext', 'cpair', 'bs_bu', 'dblfz', 'delfz', 'month', 'monat',
      'f_amt', 'f_curr', 'c_rate', 'usd_amt', 'v_spot', 'v_swap', 'v_rate', 'v_amt', 'v_gl', 'mtm_doc', 'rev_doc', 'msg'],
  },
]
