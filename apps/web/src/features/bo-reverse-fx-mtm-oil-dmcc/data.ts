import type { BuySell, ColumnDef, PaymentCode, RawRow } from './types.ts'

/** The key date the page opens on, and the one the initial expiry buckets are computed against. */
export const INITIAL_KEY_DATE = '2026-09-30'
export const INITIAL_KEY_DATE_TEXT = '30-09-2026'
export const PAGE_SIZE = 8
export const INITIAL_DOC_COUNTER = 1900048200
export const INITIAL_REV_COUNTER = 2900026300
export const CALENDAR_YEARS = { from: 2020, to: 2035 } as const
export const CSV_FILE_NAME = 'Reverse_FX_MTM.csv'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const COMPANY_NAMES: Record<string, string> = {
  SG03: 'Olam Global Agri Pte Ltd',
  AE13: 'Olam International DMCC',
  IN11: 'Olam Agri India Pvt Ltd',
}

export const COLUMNS: readonly ColumnDef[] = [
  { field: 'select', label: '', type: 'select', sticky: 'sticky-1', cls: 'col-select', sort: false },
  { field: 'rfha', label: 'Transaction', type: 'link', sticky: 'sticky-2', cls: 'col-rfha' },
  { field: 'bukrs', label: 'Company Code', type: 'text', sticky: 'sticky-3', cls: 'col-bukrs' },
  { field: 'butxt', label: 'Company Name', type: 'text' },
  { field: 'sgsart', label: 'Product Type', type: 'text' },
  { field: 'xtext', label: 'Transaction Type', type: 'text' },
  { field: 'kontrh', label: 'Business Partner', type: 'text' },
  { field: 'bpName', label: 'Partner Name', type: 'text' },
  { field: 'tradeDate', label: 'Trade Date', type: 'date' },
  { field: 'valueDate', label: 'Value Date', type: 'date' },
  { field: 'buySell', label: 'Buy/Sell', type: 'text' },
  { field: 'cpair', label: 'Currency Pair', type: 'text' },
  { field: 'fAmt', label: 'Foreign Amount', type: 'amount', group: 'ext' },
  { field: 'fCurr', label: 'Foreign Curr', type: 'text', group: 'ext' },
  { field: 'cRate', label: 'Contract Rate', type: 'rate', group: 'ext' },
  { field: 'usdAmt', label: 'USD Amount', type: 'amount', group: 'ext' },
  { field: 'vSpot', label: 'Valuation Spot', type: 'rate', group: 'mtm' },
  { field: 'vSwap', label: 'Valuation Swap', type: 'rate', group: 'mtm' },
  { field: 'vRate', label: 'Valuation Rate', type: 'rate', group: 'mtm' },
  { field: 'vAmt', label: 'Valuation Amount', type: 'amount', group: 'mtm' },
  { field: 'vGl', label: 'Valuation G/L', type: 'amount', group: 'mtm' },
  { field: 'month', label: 'Exp Mth-yr', type: 'text', group: 'mtm' },
  { field: 'monat', label: 'Exp Mth', type: 'number', group: 'mtm' },
  { field: 'ztsfDealId', label: 'Deal ID', type: 'text' },
  { field: 'invStat', label: 'Invoice', type: 'text' },
  { field: 't1Amt', label: 'T1 Amount', type: 'amount' },
  { field: 'uinvAmt', label: 'Uninvoiced Amount', type: 'amount' },
  { field: 'uinvPer', label: 'Uninvoiced %', type: 'percent' },
  { field: 'totGl', label: 'Total G/L', type: 'amount' },
  { field: 'mtmDoc', label: 'MTM Document', type: 'doc', group: 'mtm' },
  { field: 'revDoc', label: 'Rev Document', type: 'doc', group: 'mtm' },
  { field: 'msg', label: 'Message', type: 'text', group: 'mtm' },
  { field: 'externalRef', label: 'External Reference', type: 'text' },
]

type Tuple = [
  rfha: string, bukrs: string, sgsart: string, xtext: string, kontrh: string, bpName: string,
  tradeDate: string, valueDate: string, buySell: BuySell, curr1: string, curr2: string,
  amt1: number, amt2: number, cRate: number, vSpot: number, vSwap: number, cpair: string,
  dealId: string, olamDeal: string, externalRef: string, pc: PaymentCode, t1Amt: number,
  mtmDoc: string, revDoc: string,
]

function raw(t: Tuple): RawRow {
  return {
    rfha: t[0], bukrs: t[1], sgsart: t[2], xtext: t[3], kontrh: t[4], bpName: t[5],
    tradeDate: t[6], valueDate: t[7], buySell: t[8], curr1: t[9], curr2: t[10],
    amt1: t[11], amt2: t[12], cRate: t[13], vSpot: t[14], vSwap: t[15], cpair: t[16],
    ztsfDealId: t[17], zolamDealNo: t[18], externalRef: t[19], pc: t[20], t1Amt: t[21],
    mtmDoc: t[22], revDoc: t[23],
  }
}

const SCB = 'STANDARD CHARTERED BANK SINGAPORE'

/** Demo transactions (ZSGTSFR019 result list). Fresh copies each call. */
export function seedRows(): RawRow[] {
  const t: Tuple[] = [
    ['0000040000773', 'SG03', '60F', 'FX Forward', '0400000810', SCB, '2026-07-29', '2027-01-29', 'Sell', 'USD', 'SGD', 1200000, 1557600, 1.298, 1.276, 0.0042, 'USD/SGD', 'D-260773', 'OGA-773', 'EXT-773', 'P', 510000, '', ''],
    ['0000040000772', 'AE13', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-02', '2026-12-30', 'Buy', 'USD', 'INR', 850000, 71357500, 83.95, 84.48, 0.21, 'USD/INR', 'D-260772', 'DMCC-772', 'EXT-772', '', 0, '1900048172', '2900026272'],
    ['0000040000771', 'AE13', '60D', 'FX NDF', '0400000807', 'HSBC SINGAPORE', '2026-08-06', '2026-11-30', 'Sell', 'USD', 'IDR', 650000, 10562500000, 16250, 16180, 35.5, 'USD/IDR', '', 'DMCC-771', 'EXT-771', '', 0, '', ''],
    ['0000040000770', 'IN11', '60F', 'FX Forward', '0400000645', 'DBS BANK LTD', '2026-08-11', '2027-03-31', 'Buy', 'USD', 'INR', 1000000, 84350000, 84.35, 84.91, 0.29, 'USD/INR', 'D-260770', 'OGA-770', 'EXT-770', 'P', 350000, '', ''],
    ['0000040000769', 'SG03', '60F', 'FX Forward', '0400000680', SCB, '2026-08-13', '2026-10-30', 'Sell', 'EUR', 'USD', 900000, 1000800, 1.112, 1.104, 0.0025, 'EUR/USD', 'D-260769', 'OIL-769', 'EXT-769', 'C', 900000, '', ''],
    ['0000040000768', 'AE13', '60D', 'FX NDF', '0400000810', SCB, '2026-08-15', '2027-06-30', 'Buy', 'USD', 'VND', 420000, 10920000000, 26000, 25890, 54, 'USD/VND', 'D-260768', 'DMCC-768', 'EXT-768', 'P', 120000, '', ''],
    ['0000040000767', 'SG03', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-18', '2026-12-31', 'Sell', 'USD', 'JPY', 1500000, 220500000, 147, 146.15, 0.38, 'USD/JPY', '', 'OGA-767', 'EXT-767', '', 0, '', ''],
    ['0000040000766', 'IN11', '60F', 'FX Forward', '0400000645', 'DBS BANK LTD', '2026-08-20', '2027-09-30', 'Buy', 'USD', 'INR', 2000000, 169400000, 84.7, 85.2, 0.62, 'USD/INR', 'D-260766', 'OGA-766', 'EXT-766', 'P', 800000, '1900048166', '2900026266'],
    ['0000040000765', 'AE13', '60F', 'FX Forward', '0400000807', 'HSBC SINGAPORE', '2026-08-21', '2027-02-26', 'Sell', 'USD', 'SGD', 700000, 909300, 1.299, 1.281, 0.004, 'USD/SGD', 'D-260765', 'DMCC-765', 'EXT-765', '', 0, '', ''],
    ['0000040000764', 'SG03', '60F', 'FX Forward', '0400000680', SCB, '2026-08-22', '2026-10-30', 'Buy', 'EUR', 'USD', 1100000, 1229800, 1.118, 1.109, 0.002, 'EUR/USD', 'D-260764', 'OGA-764', 'EXT-764', 'P', 400000, '', ''],
    ['0000040000763', 'IN11', '60D', 'FX NDF', '0400000810', SCB, '2026-08-24', '2027-04-30', 'Sell', 'USD', 'INR', 1250000, 105375000, 84.3, 84.86, 0.46, 'USD/INR', 'D-260763', 'OGA-763', 'EXT-763', 'P', 500000, '', ''],
    ['0000040000762', 'AE13', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-25', '2026-12-30', 'Buy', 'USD', 'JPY', 600000, 88620000, 147.7, 146.88, 0.25, 'USD/JPY', '', 'DMCC-762', 'EXT-762', '', 0, '', ''],
    ['0000040000761', 'SG03', '60D', 'FX NDF', '0400000645', 'DBS BANK LTD', '2026-08-27', '2027-05-31', 'Sell', 'USD', 'VND', 300000, 7830000000, 26100, 25960, 61, 'USD/VND', 'D-260761', 'OIL-761', 'EXT-761', 'P', 90000, '', ''],
    ['0000040000760', 'IN11', '60F', 'FX Forward', '0400000807', 'HSBC SINGAPORE', '2026-08-28', '2026-11-30', 'Buy', 'USD', 'SGD', 1300000, 1688700, 1.299, 1.282, 0.0036, 'USD/SGD', 'D-260760', 'OGA-760', 'EXT-760', '', 0, '', ''],
    ['0000040000759', 'AE13', '60F', 'FX Forward', '0400000680', SCB, '2026-08-29', '2027-03-31', 'Sell', 'EUR', 'USD', 750000, 840000, 1.12, 1.111, 0.0035, 'EUR/USD', 'D-260759', 'DMCC-759', 'EXT-759', 'P', 300000, '', ''],
    ['0000040000758', 'SG03', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-30', '2027-01-29', 'Buy', 'USD', 'JPY', 950000, 140125000, 147.5, 146.73, 0.39, 'USD/JPY', 'D-260758', 'OGA-758', 'EXT-758', 'P', 190000, '', ''],
    ['0000040000757', 'IN11', '60D', 'FX NDF', '0400000645', 'DBS BANK LTD', '2026-08-31', '2027-08-31', 'Sell', 'USD', 'INR', 1750000, 147350000, 84.2, 84.79, 0.71, 'USD/INR', 'D-260757', 'OGA-757', 'EXT-757', '', 0, '', ''],
    ['0000040000756', 'AE13', '60F', 'FX Forward', '0400000810', SCB, '2026-09-01', '2027-02-26', 'Buy', 'USD', 'SGD', 500000, 650000, 1.3, 1.284, 0.0045, 'USD/SGD', '', 'DMCC-756', 'EXT-756', '', 0, '', ''],
  ]
  return t.map(raw)
}
