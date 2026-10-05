import type { Column, Counters, Payment, RawRow } from './types.ts'

export const INITIAL_KEY_DATE = '2026-09-30'
export const INITIAL_KEY_TEXT = '30-09-2026'
export const PAGE_SIZE = 8
export const INITIAL_COUNTERS: Counters = { doc: 1900048200, rev: 2900026300 }
export const POSTED_MESSAGE = 'Document Posted Sucessfully'
export const CSV_FILE_NAME = 'Reverse_FX_MTM_Other_Origins.csv'

export const COMPANY_NAMES: Readonly<Record<string, string>> = {
  SG03: 'Olam Global Agri Pte Ltd',
  AE13: 'Olam International DMCC',
  IN11: 'Olam Agri India Pvt Ltd',
}

export const COMPANY_CURRENCIES: Readonly<Record<string, string>> = {
  SG03: 'SGD',
  AE13: 'AED',
  IN11: 'INR',
}

function raw(
  rfha: string,
  bukrs: string,
  sgsart: string,
  xtext: string,
  kontrh: string,
  bpName: string,
  tradeDate: string,
  valueDate: string,
  buySell: 'Buy' | 'Sell',
  curr1: string,
  curr2: string,
  amt1: number,
  amt2: number,
  cRate: number,
  vSpot: number,
  vSwap: number,
  cpair: string,
  dealId: string,
  olamDeal: string,
  externalRef: string,
  pc: Payment,
  t1Amt: number,
  mtmDoc: string,
  revDoc: string,
): RawRow {
  return {
    rfha,
    bukrs,
    butxt: COMPANY_NAMES[bukrs] ?? '',
    zWaers: COMPANY_CURRENCIES[bukrs] ?? '',
    sgsart,
    xtext,
    kontrh,
    bpName,
    tradeDate,
    valueDate,
    buySell,
    curr1,
    curr2,
    amt1,
    amt2,
    cRate,
    vSpot,
    vSwap,
    cpair,
    ztsfDealId: dealId,
    zolamDealNo: olamDeal,
    externalRef,
    pc,
    t1Amt,
    mtmDoc,
    revDoc,
  }
}

const SCB = 'STANDARD CHARTERED BANK SINGAPORE'

export const INITIAL_ROWS: readonly RawRow[] = [
  raw('0000041000873', 'SG03', '60F', 'FX Forward', '0400000810', SCB, '2026-07-29', '2027-01-29', 'Sell', 'USD', 'SGD', 1200000, 1557600, 1.298, 1.276, 0.0042, 'USD/SGD', 'D-410873', 'OGA-873', 'EXT-873', 'P', 510000, '', ''),
  raw('0000041000872', 'AE13', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-02', '2026-12-30', 'Buy', 'USD', 'AED', 850000, 3121205, 3.672, 3.6715, 0.0004, 'USD/AED', 'D-410872', 'DMCC-872', 'EXT-872', '', 0, '1900051172', '2900029172'),
  raw('0000041000871', 'IN11', '60D', 'FX NDF', '0400000807', 'HSBC SINGAPORE', '2026-08-06', '2026-11-30', 'Sell', 'USD', 'INR', 650000, 54567500, 83.95, 84.48, 0.21, 'USD/INR', '', 'OGA-871', 'EXT-871', '', 0, '', ''),
  raw('0000041000870', 'IN11', '60F', 'FX Forward', '0400000645', 'DBS BANK LTD', '2026-08-11', '2027-03-31', 'Buy', 'USD', 'INR', 1000000, 84350000, 84.35, 84.91, 0.29, 'USD/INR', 'D-410870', 'OGA-870', 'EXT-870', 'P', 350000, '', ''),
  raw('0000041000869', 'SG03', '60F', 'FX Forward', '0400000680', SCB, '2026-08-13', '2026-10-30', 'Sell', 'USD', 'SGD', 900000, 1169100, 1.299, 1.281, 0.003, 'USD/SGD', 'D-410869', 'OGA-869', 'EXT-869', 'C', 900000, '', ''),
  raw('0000041000868', 'AE13', '60D', 'FX NDF', '0400000810', SCB, '2026-08-15', '2027-06-30', 'Buy', 'USD', 'AED', 420000, 1542660, 3.673, 3.6718, 0.0006, 'USD/AED', 'D-410868', 'DMCC-868', 'EXT-868', 'P', 120000, '', ''),
  raw('0000041000867', 'IN11', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-18', '2026-12-31', 'Sell', 'USD', 'INR', 1500000, 126450000, 84.3, 84.86, 0.38, 'USD/INR', '', 'OGA-867', 'EXT-867', '', 0, '', ''),
  raw('0000041000866', 'SG03', '60F', 'FX Forward', '0400000645', 'DBS BANK LTD', '2026-08-20', '2027-09-30', 'Buy', 'USD', 'SGD', 2000000, 2598000, 1.299, 1.282, 0.0062, 'USD/SGD', 'D-410866', 'OGA-866', 'EXT-866', 'P', 800000, '1900051166', '2900029166'),
  raw('0000041000865', 'AE13', '60F', 'FX Forward', '0400000807', 'HSBC SINGAPORE', '2026-08-21', '2027-02-26', 'Sell', 'USD', 'AED', 700000, 2570400, 3.672, 3.6716, 0.0004, 'USD/AED', 'D-410865', 'DMCC-865', 'EXT-865', '', 0, '', ''),
  raw('0000041000864', 'SG03', '60F', 'FX Forward', '0400000680', SCB, '2026-08-22', '2026-10-30', 'Buy', 'USD', 'SGD', 1100000, 1426700, 1.297, 1.28, 0.002, 'USD/SGD', 'D-410864', 'OGA-864', 'EXT-864', 'P', 400000, '', ''),
  raw('0000041000863', 'IN11', '60D', 'FX NDF', '0400000810', SCB, '2026-08-24', '2027-04-30', 'Sell', 'USD', 'INR', 1250000, 105375000, 84.3, 84.86, 0.46, 'USD/INR', 'D-410863', 'OGA-863', 'EXT-863', 'P', 500000, '', ''),
  raw('0000041000862', 'AE13', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-25', '2026-12-30', 'Buy', 'USD', 'AED', 600000, 2203800, 3.673, 3.6717, 0.0005, 'USD/AED', '', 'DMCC-862', 'EXT-862', '', 0, '', ''),
  raw('0000041000861', 'IN11', '60D', 'FX NDF', '0400000645', 'DBS BANK LTD', '2026-08-27', '2027-05-31', 'Sell', 'USD', 'INR', 300000, 25260000, 84.2, 84.76, 0.31, 'USD/INR', 'D-410861', 'OGA-861', 'EXT-861', 'P', 90000, '', ''),
  raw('0000041000860', 'SG03', '60F', 'FX Forward', '0400000807', 'HSBC SINGAPORE', '2026-08-28', '2026-11-30', 'Buy', 'USD', 'SGD', 1300000, 1688700, 1.299, 1.282, 0.0036, 'USD/SGD', 'D-410860', 'OGA-860', 'EXT-860', '', 0, '', ''),
  raw('0000041000859', 'AE13', '60F', 'FX Forward', '0400000680', SCB, '2026-08-29', '2027-03-31', 'Sell', 'USD', 'AED', 750000, 2754750, 3.673, 3.6714, 0.0007, 'USD/AED', 'D-410859', 'DMCC-859', 'EXT-859', 'P', 300000, '', ''),
  raw('0000041000858', 'IN11', '60F', 'FX Forward', '0400000003', 'BARCLAYS BANK PLC', '2026-08-30', '2027-01-29', 'Buy', 'USD', 'INR', 950000, 80085000, 84.3, 84.73, 0.39, 'USD/INR', 'D-410858', 'OGA-858', 'EXT-858', 'P', 190000, '', ''),
  raw('0000041000857', 'SG03', '60D', 'FX NDF', '0400000645', 'DBS BANK LTD', '2026-08-31', '2027-08-31', 'Sell', 'USD', 'SGD', 1750000, 2271500, 1.298, 1.279, 0.0071, 'USD/SGD', 'D-410857', 'OGA-857', 'EXT-857', '', 0, '', ''),
  raw('0000041000856', 'AE13', '60F', 'FX Forward', '0400000810', SCB, '2026-09-01', '2027-02-26', 'Buy', 'USD', 'AED', 500000, 1836500, 3.673, 3.6715, 0.0005, 'USD/AED', '', 'DMCC-856', 'EXT-856', '', 0, '', ''),
]

export const COLUMNS: readonly Column[] = [
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
  { field: 'ccAmt', label: 'Company Code Amount', type: 'amount', group: 'ext' },
  { field: 'zWaers', label: 'Local Curr', type: 'text', group: 'ext' },
  { field: 'vSpot', label: 'Valuation Spot', type: 'rate', group: 'mtm' },
  { field: 'vSwap', label: 'Valuation Swap', type: 'rate', group: 'mtm' },
  { field: 'vRate', label: 'Valuation Rate', type: 'rate', group: 'mtm' },
  { field: 'vAmt', label: 'Valuation Amount', type: 'amount', group: 'mtm' },
  { field: 'vCgl', label: 'Local Valuation G/L', type: 'amount', group: 'mtm' },
  { field: 'valMer', label: 'Valuation MER', type: 'rate', group: 'mtm' },
  { field: 'vGl', label: 'Valuation G/L (USD)', type: 'amount', group: 'mtm' },
  { field: 'month', label: 'Exp Mth-yr', type: 'text', group: 'mtm' },
  { field: 'monat', label: 'Exp Mth', type: 'number', group: 'mtm' },
  { field: 'ztsfDealId', label: 'Deal ID', type: 'text' },
  { field: 'invStat', label: 'Invoice', type: 'text' },
  { field: 't1Amt', label: 'T1 Amount', type: 'amount' },
  { field: 'uinvAmt', label: 'Uninvoiced Amount', type: 'amount' },
  { field: 'uinvPer', label: 'Uninvoiced %', type: 'percent' },
  { field: 'locUninv', label: 'Loc Curr Uninv', type: 'amount' },
  { field: 'totGl', label: 'Total G/L', type: 'amount' },
  { field: 'mtmDoc', label: 'MTM Document', type: 'doc', group: 'mtm' },
  { field: 'revDoc', label: 'Rev Document', type: 'doc', group: 'mtm' },
  { field: 'msg', label: 'Message', type: 'text', group: 'mtm' },
  { field: 'externalRef', label: 'External Reference', type: 'text' },
]
