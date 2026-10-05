import { deriveRow } from './logic.ts'
import type { BuySell, Counters, PaymentCode, RawRow, Row } from './types.ts'

/** Month-end the demo opens on (ISO), and the same date as typed in the Key Date box. */
export const INITIAL_KEY_DATE = '2026-09-30'
export const DEFAULT_KEY_DATE_TEXT = '30-09-2026'
export const PAGE_SIZE = 8
export const INITIAL_COUNTERS: Counters = { doc: 1900064200, rev: 2900032200 }
export const TOAST_MS = 2600
export const CALENDAR_YEARS = { from: 2020, to: 2035 }

export const COMPANY_NAMES: Record<string, string> = {
  IN10: 'Olam International India Pvt Ltd',
  IN11: 'Olam Agri India Pvt Ltd',
}

export const DEAL_TYPE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'WITH', label: 'With Deal ID' },
  { value: 'WITHOUT', label: 'Without Deal ID' },
] as const

/** One demo transaction; the arguments follow the original's positional raw(...) call. */
function raw(
  rfha: string,
  bukrs: string,
  sgsart: string,
  xtext: string,
  kontrh: string,
  bpName: string,
  tradeDate: string,
  valueDate: string,
  buySell: BuySell,
  usdAmt: number,
  inrAmt: number,
  cRate: number,
  vSpot: number,
  vSwap: number,
  ztsfDealId: string,
  zolamDealNo: string,
  externalRef: string,
  pc: PaymentCode,
  t1Amt: number,
  mtmDoc: string,
  revDoc: string,
  mtmDoc2: string,
  revDoc2: string,
): RawRow {
  return {
    rfha,
    bukrs,
    butxt: COMPANY_NAMES[bukrs] ?? '',
    sgsart,
    xtext,
    kontrh,
    bpName,
    tradeDate,
    valueDate,
    buySell,
    curr1: 'USD',
    curr2: 'INR',
    amt1: usdAmt,
    amt2: inrAmt,
    cRate,
    vSpot,
    vSwap,
    cpair: 'USD/INR',
    ztsfDealId,
    zolamDealNo,
    externalRef,
    pc,
    t1Amt,
    mtmDoc,
    revDoc,
    mtmDoc2,
    revDoc2,
    msg: mtmDoc ? 'Document Posted Sucessfully' : '',
  }
}

export const INITIAL_RAW_ROWS: RawRow[] = [
  raw('0000050000978', 'IN11', '60F', 'FX Forward', '0400000810', 'STANDARD CHARTERED BANK INDIA', '2026-07-24', '2027-01-29', 'Sell', 1200000, 101040000, 84.2, 84.51, 0.18, 'D-IN-978', 'OGA-IN-978', 'IND-EXT-978', 'P', 450000, '', '', '', ''),
  raw('0000050000977', 'IN10', '60F', 'FX Forward', '0400000003', 'CITI BANK N.A. INDIA', '2026-07-29', '2026-12-31', 'Buy', 850000, 71612500, 84.25, 84.42, 0.16, 'D-IN-977', 'OI-IN-977', 'IND-EXT-977', '', 0, '1900064177', '2900032177', '1900065177', '2900033177'),
  raw('0000050000976', 'IN11', '60D', 'FX NDF', '0400000807', 'HSBC INDIA', '2026-08-02', '2026-11-30', 'Sell', 650000, 54892500, 84.45, 84.6, 0.12, '', 'OGA-IN-976', 'IND-EXT-976', '', 0, '', '', '', ''),
  raw('0000050000975', 'IN11', '60F', 'FX Forward', '0400000645', 'DBS BANK INDIA LTD', '2026-08-05', '2027-03-31', 'Buy', 1000000, 84400000, 84.4, 84.61, 0.23, 'D-IN-975', 'OGA-IN-975', 'IND-EXT-975', 'P', 350000, '', '', '', ''),
  raw('0000050000974', 'IN10', '60F', 'FX Forward', '0400000680', 'ICICI BANK LTD', '2026-08-08', '2026-10-30', 'Sell', 900000, 76050000, 84.5, 84.43, 0.08, 'D-IN-974', 'OI-IN-974', 'IND-EXT-974', 'C', 900000, '', '', '', ''),
  raw('0000050000973', 'IN11', '60D', 'FX NDF', '0400000810', 'STANDARD CHARTERED BANK INDIA', '2026-08-10', '2027-06-30', 'Buy', 420000, 35427000, 84.35, 84.66, 0.31, 'D-IN-973', 'OGA-IN-973', 'IND-EXT-973', 'P', 120000, '', '', '', ''),
  raw('0000050000972', 'IN10', '60F', 'FX Forward', '0400000003', 'CITI BANK N.A. INDIA', '2026-08-13', '2026-12-31', 'Sell', 1500000, 126675000, 84.45, 84.5, 0.14, '', 'OI-IN-972', 'IND-EXT-972', '', 0, '', '', '', ''),
  raw('0000050000971', 'IN11', '60F', 'FX Forward', '0400000645', 'DBS BANK INDIA LTD', '2026-08-16', '2027-09-30', 'Buy', 2000000, 168900000, 84.45, 84.72, 0.48, 'D-IN-971', 'OGA-IN-971', 'IND-EXT-971', 'P', 800000, '1900064171', '2900032171', '1900065171', '2900033171'),
  raw('0000050000970', 'IN10', '60F', 'FX Forward', '0400000807', 'HSBC INDIA', '2026-08-18', '2027-02-26', 'Sell', 700000, 59115000, 84.45, 84.56, 0.17, 'D-IN-970', 'OI-IN-970', 'IND-EXT-970', '', 0, '', '', '', ''),
  raw('0000050000969', 'IN11', '60F', 'FX Forward', '0400000680', 'ICICI BANK LTD', '2026-08-20', '2026-10-30', 'Buy', 1100000, 92840000, 84.4, 84.47, 0.09, 'D-IN-969', 'OGA-IN-969', 'IND-EXT-969', 'P', 400000, '', '', '', ''),
  raw('0000050000968', 'IN10', '60D', 'FX NDF', '0400000810', 'STANDARD CHARTERED BANK INDIA', '2026-08-22', '2027-04-30', 'Sell', 1250000, 105562500, 84.45, 84.65, 0.28, 'D-IN-968', 'OI-IN-968', 'IND-EXT-968', 'P', 500000, '', '', '', ''),
  raw('0000050000967', 'IN11', '60F', 'FX Forward', '0400000003', 'CITI BANK N.A. INDIA', '2026-08-24', '2026-12-30', 'Buy', 600000, 50610000, 84.35, 84.51, 0.15, '', 'OGA-IN-967', 'IND-EXT-967', '', 0, '', '', '', ''),
  raw('0000050000966', 'IN10', '60D', 'FX NDF', '0400000645', 'DBS BANK INDIA LTD', '2026-08-26', '2027-05-31', 'Sell', 300000, 25365000, 84.55, 84.69, 0.3, 'D-IN-966', 'OI-IN-966', 'IND-EXT-966', 'P', 90000, '', '', '', ''),
  raw('0000050000965', 'IN11', '60F', 'FX Forward', '0400000807', 'HSBC INDIA', '2026-08-27', '2026-11-30', 'Buy', 1300000, 109785000, 84.45, 84.53, 0.11, 'D-IN-965', 'OGA-IN-965', 'IND-EXT-965', '', 0, '', '', '', ''),
  raw('0000050000964', 'IN10', '60F', 'FX Forward', '0400000680', 'ICICI BANK LTD', '2026-08-28', '2027-03-31', 'Sell', 750000, 63375000, 84.5, 84.62, 0.25, 'D-IN-964', 'OI-IN-964', 'IND-EXT-964', 'P', 300000, '', '', '', ''),
  raw('0000050000963', 'IN11', '60F', 'FX Forward', '0400000003', 'CITI BANK N.A. INDIA', '2026-08-29', '2027-01-29', 'Buy', 950000, 80227500, 84.45, 84.59, 0.22, 'D-IN-963', 'OGA-IN-963', 'IND-EXT-963', 'P', 190000, '', '', '', ''),
  raw('0000050000962', 'IN10', '60D', 'FX NDF', '0400000645', 'DBS BANK INDIA LTD', '2026-08-30', '2027-08-31', 'Sell', 1750000, 147962500, 84.55, 84.7, 0.41, 'D-IN-962', 'OI-IN-962', 'IND-EXT-962', '', 0, '', '', '', ''),
  raw('0000050000961', 'IN11', '60F', 'FX Forward', '0400000810', 'STANDARD CHARTERED BANK INDIA', '2026-08-31', '2027-02-26', 'Buy', 500000, 42200000, 84.4, 84.57, 0.19, '', 'OGA-IN-961', 'IND-EXT-961', '', 0, '', '', '', ''),
]

/** A fresh, derived copy of the demo rows (what Refresh restores). */
export function seedRows(): Row[] {
  return INITIAL_RAW_ROWS.map((r) => deriveRow(r, INITIAL_KEY_DATE))
}
