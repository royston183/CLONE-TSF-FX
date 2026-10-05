/*
 * UI-only dummy data. Everything in this file is quarantined here: when the page is wired to the
 * SAP middleware (ZSGTSFR092) these master lists, the field-definition tables and the seeded deal
 * generator are the only things that get replaced.
 *
 * The deals come from a deterministic pseudo-random generator, seeded the same way on every load
 * and on Refresh, so the demo dataset is always identical to the original page's.
 */
import { dateOffset, pad, round } from './format.ts'
import type {
  Company,
  Deal,
  FieldDef,
  FieldDefs,
  FieldType,
  Partner,
  StatusMeta,
  Trader,
  TxnType,
  TxnTypeOption,
} from './types.ts'

export const DEMO_TODAY = '05-10-2026'
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZES = [8, 12, 20] as const
export const RNG_SEED = 20261005

export const COMPANY_CODES: Company[] = [
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL', currency: 'INR', pc: 'IN11PC01', pcName: 'Agri Trading India', ba: 'IN01', baName: 'Agri Commodities India', portfolio: 'FXHDG-IN', acct: 'Hedge - Cash Flow' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd', entity: 'OTL', currency: 'THB', pc: 'TH10PC01', pcName: 'Rice Trading Thailand', ba: 'TH01', baName: 'Rice & Grains Thailand', portfolio: 'FXHDG-TH', acct: 'Hedge - Cash Flow' },
  { code: 'VN10', name: 'Olam Vietnam Limited', entity: 'OVL', currency: 'VND', pc: 'VN10PC01', pcName: 'Agri Trading Vietnam', ba: 'VN01', baName: 'Agri Commodities Vietnam', portfolio: 'FXHDG-VN', acct: 'Hedge - Fair Value' },
]

/** Company codes the user is authorised for (ABAP: AUTHORITY-CHECK F_BKPF_BUK, ACTVT 02). */
export const AUTHORIZED_COMPANY_CODES = ['IN11', 'TH10', 'VN10']

export const PARTNERS: Partner[] = [
  { id: '0000100231', name: 'HSBC' },
  { id: '0000100245', name: 'Citi' },
  { id: '0000100262', name: 'Standard Chartered' },
  { id: '0000100278', name: 'JPMorgan' },
  { id: '0000100291', name: 'Deutsche Bank' },
]

export const TRADERS: Record<string, Trader[]> = {
  IN11: [
    { id: 'RKAPOOR', code: 'T101', name: 'Rohan Kapoor' },
    { id: 'SIYER', code: 'T102', name: 'Sneha Iyer' },
  ],
  TH10: [{ id: 'PWONGSA', code: 'T201', name: 'Pim Wongsa' }],
  VN10: [{ id: 'LNGUYEN', code: 'T301', name: 'Linh Nguyen' }],
}

export const FX_TXN_TYPES: Record<string, TxnTypeOption[]> = {
  IN11: [
    { code: '110', text: 'FX Forward' },
    { code: '120', text: 'FX Swap' },
    { code: '130', text: 'NDF Forward' },
  ],
  TH10: [
    { code: '110', text: 'FX Forward' },
    { code: '120', text: 'FX Swap' },
  ],
  VN10: [
    { code: '110', text: 'FX Forward' },
    { code: '120', text: 'FX Swap' },
  ],
}
export const OP_TXN_TYPES: TxnTypeOption[] = [
  { code: '210', text: 'FX Option - Vanilla' },
  { code: '220', text: 'FX Option - Staggered' },
]

const COMMODITY_NAMES = ['WHEAT', 'BARLEY', 'CORN', 'MAIZE', 'RUBBER', 'PALMOLEIN', 'SOYOIL', 'SESAME', 'COTTON', 'RICE', 'Fertilizer', 'SOYABEAN']
const FX_MODEL_CODES = ['M032', 'M033', 'M034', 'M035', 'M036', 'M037', 'M041']
const MC_NUMBERS = [2000002728, 2000002727, 2000002726, 2000002725, 2000002724, 2000002723, 2000002722, 2000002719, 2000002718, 2000002717, 2000002716, 2000002715, 2000002714, 2000002713, 2000002712, 2000002710, 2000002709, 2000002708]

/**
 * Transaction statuses read by the report: 07 -> 08, 13 -> 11 on rejection (ABAP USER_COMMAND /
 * REVERSE). The descriptions are dummy values for the External Status column.
 */
export const TXN_STATUS_META: Record<string, StatusMeta> = {
  '07': { ext: 'Confirmed by MO', target: '08', textCls: 'status-text-confirmed' },
  '13': { ext: 'Pending Settlement', target: '11', textCls: 'status-text-offset' },
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const GROUP_ORDER = ['Transaction', 'Partner & Organisation', 'References', 'Dates', 'Currency & Amounts', 'Rates', 'Option Details', 'Premium', 'Cash Settlement', 'TSF Attributes', 'Profit & Loss', 'Remarks', 'Audit']

/** "key|label|type|group" lines to a field-definition list plus a by-key map. */
function parseDefs(lines: string[]): FieldDefs {
  const list: FieldDef[] = []
  const byKey: Record<string, FieldDef> = {}
  for (const line of lines) {
    const p = line.split('|')
    const d: FieldDef = { key: p[0] ?? '', label: p[1] ?? '', type: (p[2] ?? 'text') as FieldType, group: p[3] ?? '' }
    list.push(d)
    byKey[d.key] = d
  }
  return { list, byKey }
}

/** Field definitions: key | label | type | group.  Types: text, date, time, amt, rate. */
export const FX_FIELD_DEFS = parseDefs([
  'rfha|Transaction|text|Transaction','bukrs|Company Code|text|Transaction','butxt|Company Name|text|Transaction','zcom_id|TSF Entity|text|Transaction','zwaers|Co Code Curr|text|Transaction',
  'sgsart|Product Type|text|Transaction','ltx|Product Type Desc|text|Transaction','sanlf|Product Category|text|Transaction','sfgtyp|Transaction Category|text|Transaction',
  'sfhaart|Transaction Type|text|Transaction','xtext|Transaction Type Description|text|Transaction','saktiv|Active Status|text|Transaction','rfhazul|Active Activity|text|Transaction',
  'txn_status|Txn Status|text|Transaction','ext_stat_desc|External Status Desc|text|Transaction','mat_unmat|Matched / Unmatched|text|Transaction','objnr|Object Number|text|Transaction','refnr|Reference|text|Transaction',
  'kontrh|Business Partner|text|Partner & Organisation','bp_name|Partner Name|text|Partner & Organisation','gsppart|Contact Person|text|Partner & Organisation','nordext|External Reference|text|Partner & Organisation',
  'rdealer|Trader|text|Partner & Organisation','ztrcode|Trader Code|text|Partner & Organisation','trd_name|Trader Name|text|Partner & Organisation',
  'prctr|Profit Center|text|Partner & Organisation','pc_name|Profit Center Name|text|Partner & Organisation','rbusa|Business Area|text|Partner & Organisation','ba_name|Business Area Desc|text|Partner & Organisation',
  'rportb|Portfolio|text|Partner & Organisation','xportb|Accounting Category|text|Partner & Organisation','zgrp|Group|text|Partner & Organisation','grp_desc|Group Desc|text|Partner & Organisation','tsf_code|Blotter Code|text|Partner & Organisation','blo_desc|Blotter Desc|text|Partner & Organisation',
  'refer|Internal Reference|text|References','int_ref_desc|Internal Reference Desc|text|References','zuonr|Finance Project|text|References','zuond|Assignment|text|References','assign_desc|Assignment Desc|text|References','zsubject|Subject|text|References','email_code|Email Code|text|References','merkm|Characteristic|text|References',
  'blotter_date|Blotter Date|date|Dates','dblfz|Trade Date|date|Dates','delfz|Value Date|date|Dates','v_date|Valuation Date|date|Dates','ndf_date|Fixing Date|date|Dates',
  'bs|Buy/Sell|text|Currency & Amounts','bs_o|Buy/Sell (Original)|text|Currency & Amounts','bs_1|Buy/Sell 1|text|Currency & Amounts','bs_2|Buy/Sell 2|text|Currency & Amounts',
  'curr1|Currency 1|text|Currency & Amounts','amt1|Amount 1|amt|Currency & Amounts','curr2|Currency 2|text|Currency & Amounts','amt2|Amount 2|amt|Currency & Amounts',
  'curr_st1|Incoming Currency|text|Currency & Amounts','zamt_st1|Drawing Amount (Incoming)|amt|Currency & Amounts','curr_st2|Outgoing Currency|text|Currency & Amounts','zamt_st2|Drawing Amount (Outgoing)|amt|Currency & Amounts',
  'cpair|Currency Pair|text|Currency & Amounts','zsett_pair|Settlement Pair|text|Currency & Amounts','f_curr1|From Currency|text|Currency & Amounts','t_curr1|To Currency|text|Currency & Amounts','cash_curr|Cash Currency|text|Currency & Amounts','zcash_amt|Cash Amount|amt|Currency & Amounts',
  'spot|Spot Rate|rate|Rates','swap|Swap Rate|rate|Rates','tot_rate|Total Rate|rate|Rates','t_rate|All in Rate|rate|Rates','ospot|Spot Rate (Original)|rate|Rates','oswap|Swap Rate (Original)|rate|Rates','otot_rate|All in Rate (Original)|rate|Rates','ndf_rate|NDF Rate|rate|Rates','ndf_ref|Fixing Reference ID|text|Rates',
  'ztsf_deal_id|TSF Deal ID|text|TSF Attributes','ztsf_deal_desc|TSF Deal Description|text|TSF Attributes','ztsf_mc_ref_no|MC Reference No|text|TSF Attributes','ztsf_deal_type|TSF Deal Type|text|TSF Attributes','zolam_deal_no|Olam Deal No|text|TSF Attributes','ztsf_trftype|Transfer Type|text|TSF Attributes','ztsf_trftype2|Transfer Type 2|text|TSF Attributes','ztsf_exe_co|Executing Company|text|TSF Attributes',
  'zpl|P&L|amt|Profit & Loss','zpl_curr|P&L Currency|text|Profit & Loss','zpl_rate|P&L Rate|rate|Profit & Loss','zpl_lamt|P&L (Local)|amt|Profit & Loss','zpl_lcurr|P&L Local Currency|text|Profit & Loss',
  'fo_remark|FO Remark|text|Remarks','mo_remark|MO Remark|text|Remarks','ndf_fo_rem|NDF FO Remark|text|Remarks','ndf_mo_rem|NDF MO Remark|text|Remarks',
  'dcrdat|Entered On|date|Audit','cruser|Entered By|text|Audit','tcrtim|Entry Time|time|Audit','dupdat|Changed On|date|Audit','upuser|Last Changed By|text|Audit','tuptim|Time Changed|time|Audit',
])

export const OP_FIELD_DEFS = parseDefs([
  'rfha|Transaction|text|Transaction','bukrs|Company Code|text|Transaction','butxt|Company Name|text|Transaction','zcom_id|TSF Entity|text|Transaction',
  'sgsart|Product Type|text|Transaction','ltx|Product Type Desc|text|Transaction','sfhaart|Transaction Type|text|Transaction','xtext|Transaction Type Description|text|Transaction',
  'saktiv|Active Status|text|Transaction','rfhazul|Active Activity|text|Transaction','txn_status|Txn Status|text|Transaction','ext_stat_desc|External Status Desc|text|Transaction','mat_unmat|Matched / Unmatched|text|Transaction',
  'kontrh|Business Partner|text|Partner & Organisation','bp_name|Partner Name|text|Partner & Organisation','gsppart|Contact Person|text|Partner & Organisation','nordext|External Reference|text|Partner & Organisation',
  'rdealer|Trader|text|Partner & Organisation','ztrcode|Trader Code|text|Partner & Organisation','trd_name|Trader Name|text|Partner & Organisation',
  'prctr|Profit Center|text|Partner & Organisation','pc_name|Profit Center Name|text|Partner & Organisation','rbusa|Business Area|text|Partner & Organisation','ba_name|Business Area Desc|text|Partner & Organisation',
  'rportb|Portfolio|text|Partner & Organisation','xportb|Accounting Category|text|Partner & Organisation','zgrp|Group|text|Partner & Organisation','grp_desc|Group Desc|text|Partner & Organisation','tsf_code|Blotter Code|text|Partner & Organisation','blo_desc|Blotter Desc|text|Partner & Organisation',
  'refer|Internal Reference|text|References','int_ref_desc|Internal Reference Desc|text|References','zuond|Assignment|text|References','assign_desc|Assignment Desc|text|References','email_code|Email Code|text|References','merkm|Characteristic|text|References',
  'blotter_date|Blotter Date|date|Dates','dblfz|Trade Date|date|Dates','delfz|Value Date|date|Dates','e_date|Expiry Date|date|Dates',
  'e_type|Exercise Type|text|Option Details','s_type|Settlement Type|text|Option Details','settlfl|Settlement Flag|text|Option Details','sputcal|Put/Call|text|Option Details','soptaus|Option Category|text|Option Details',
  'pc1|Put/Call 1|text|Option Details','pc2|Put/Call 2|text|Option Details','kkurs|Strike Rate|rate|Option Details','exp_rate|Expiry Rate|rate|Option Details',
  'expiry_location|Expiry Location|text|Option Details','expiry_time|Expiry Time|time|Option Details','loc_code_text|Location Code Text|text|Option Details',
  'curr1|Currency 1|text|Currency & Amounts','amt1|Amount 1|amt|Currency & Amounts','curr2|Currency 2|text|Currency & Amounts','amt2|Amount 2|amt|Currency & Amounts','cpair|Currency Pair|text|Currency & Amounts','f_curr1|From Currency|text|Currency & Amounts','t_curr1|To Currency|text|Currency & Amounts',
  'bzbetr|Premium Amount|amt|Premium','wzbetr|Premium Currency|text|Premium','dzterm|Premium Date|date|Premium','pwkurs|Premium Rate|rate|Premium',
  'cs_date|Cash Settlement Date|date|Cash Settlement','cs_amt|Cash Settlement Amount|amt|Cash Settlement','cs_curr|Cash Settlement Currency|text|Cash Settlement','cs_rate|Cash Settlement Rate|rate|Cash Settlement',
  'ztsf_deal_id|TSF Deal ID|text|TSF Attributes','ztsf_deal_desc|TSF Deal Description|text|TSF Attributes','ztsf_mc_ref_no|MC Reference No|text|TSF Attributes','ztsf_deal_type|TSF Deal Type|text|TSF Attributes','zolam_deal_no|Olam Deal No|text|TSF Attributes','ztsf_trftype|Transfer Type|text|TSF Attributes','ztsf_trftype2|Transfer Type 2|text|TSF Attributes','ztsf_exe_co|Executing Company|text|TSF Attributes',
  'zpl|P&L|amt|Profit & Loss','zpl_curr|P&L Currency|text|Profit & Loss','zpl_rate|P&L Rate|rate|Profit & Loss','zpl_lamt|P&L (Local)|amt|Profit & Loss','zpl_lcurr|P&L Local Currency|text|Profit & Loss',
  'fo_remark|FO Remark|text|Remarks','mo_remark|MO Remark|text|Remarks',
  'dcrdat|Entered On|date|Audit','cruser|Entered By|text|Audit','tcrtim|Entry Time|time|Audit','dupdat|Changed On|date|Audit','upuser|Last Changed By|text|Audit','tuptim|Time Changed|time|Audit',
])

/**
 * Table columns shown in the list (ALV order: checkbox, remarks, then the view fields). The
 * remaining ALV fields are shown in the Transaction Details popup.
 */
export const TABLE_COLUMNS: Record<TxnType, string[]> = {
  FX: ['bo_rem', 'rfha', 'txn_status', 'ext_stat_desc', 'bukrs', 'zcom_id', 'bp_name', 'xtext', 'blotter_date', 'dblfz', 'delfz', 'bs_1', 'curr1', 'amt1', 'curr2', 'amt2', 't_rate', 'spot', 'swap', 'ztsf_deal_id', 'ztsf_mc_ref_no', 'rdealer', 'fo_remark'],
  OP: ['bo_rem', 'rfha', 'txn_status', 'ext_stat_desc', 'bukrs', 'zcom_id', 'bp_name', 'xtext', 'blotter_date', 'dblfz', 'e_date', 'sputcal', 'curr1', 'amt1', 'curr2', 'amt2', 'kkurs', 'e_type', 's_type', 'ztsf_deal_id', 'ztsf_mc_ref_no', 'rdealer', 'fo_remark'],
}

// ------------------------------------------------------------------ seeded generator

/** Linear congruential generator, so the demo is always identical. */
export type Rng = {
  next: () => number
  pick: <T>(arr: readonly T[]) => T
  between: (a: number, b: number) => number
}

export function makeRng(seed: number): Rng {
  let s = seed
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  return {
    next,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
    between: (a: number, b: number) => a + next() * (b - a),
  }
}

function findCompany(code: string): Company {
  const co = COMPANY_CODES.find((c) => c.code === code)
  if (!co) throw new Error(`unknown company code ${code}`)
  return co
}

type Common = {
  co: Company
  trade: string
  comm: string
  dealNo: number
  tsfDealNo: number
  usd: number
  c: Deal
}

function buildCommon(rng: Rng, i: number, cc: string, status: string, kind: TxnType): Common {
  const { pick, between, next } = rng
  const co = findCompany(cc)
  const partner = PARTNERS[(i * 3 + (kind === 'OP' ? 1 : 0)) % PARTNERS.length] as Partner
  const traderList = TRADERS[cc] as Trader[]
  const trader = traderList[i % traderList.length] as Trader
  const blotter = dateOffset(DEMO_TODAY, -Math.floor((i * 14) / (kind === 'FX' ? 28 : 16)))
  const trade = blotter
  const mcNo = MC_NUMBERS[i % MC_NUMBERS.length] as number
  const comm = COMMODITY_NAMES[(i * 5) % COMMODITY_NAMES.length] as string
  const model = FX_MODEL_CODES[(i * 3) % FX_MODEL_CODES.length] as string
  const dealNo = (kind === 'FX' ? 1000004100 : 1000005200) + i * 3 + (cc === 'IN11' ? 0 : 1)
  const tsfDealNo = 900100 + i * 7 + (kind === 'OP' ? 300 : 0)
  const usd = pick([250000, 500000, 750000, 1000000, 1250000, 2000000, 3500000, 5000000])
  // The order of the random draws below is the order of the original page; do not reorder.
  const c: Deal = {
    rfha: String(dealNo),
    bukrs: cc,
    butxt: co.name,
    zcom_id: co.entity,
    zwaers: co.currency,
    txn_status: status,
    ext_stat_desc: (TXN_STATUS_META[status] as StatusMeta).ext,
    mat_unmat: next() < 0.7 ? 'Matched' : 'Unmatched',
    saktiv: '1',
    rfhazul: pad(4 + Math.floor(next() * 3), 5),
    kontrh: partner.id,
    bp_name: partner.name,
    gsppart: pick(['A. Mehta', 'S. Rao', 'J. Fernandes', 'M. Chen', 'D. Walker', 'K. Tanaka']),
    nordext: `EXT-${partner.name.substring(0, 4).toUpperCase().replace(/ /g, '')}-26-${pad(4100 + i * 11, 5)}`,
    rdealer: trader.id,
    ztrcode: trader.code,
    trd_name: trader.name,
    prctr: co.pc,
    pc_name: co.pcName,
    rbusa: co.ba,
    ba_name: co.baName,
    rportb: co.portfolio,
    xportb: co.acct,
    zgrp: i % 2 === 0 ? 'G01' : 'G02',
    grp_desc: i % 2 === 0 ? 'Import Payment Hedge' : 'Export Receivable Hedge',
    tsf_code: i % 2 === 0 ? 'BL01' : 'BL02',
    blo_desc: i % 2 === 0 ? 'Trade Finance Blotter' : 'Commodity Blotter',
    refer: `INT/2026/${pad(310 + i, 4)}`,
    int_ref_desc: `${comm} hedge - ${co.entity}`,
    zuond: `ASG-${co.entity}-${pad(40 + i, 4)}`,
    assign_desc: `${comm} shipment cover`,
    email_code: `EM${pad(1 + (i % 4), 2)}`,
    merkm: '',
    blotter_date: blotter,
    dblfz: trade,
    ztsf_deal_id: `DEAL-${tsfDealNo}`,
    ztsf_mc_ref_no: `MC/${co.entity}/2026/${String(mcNo).slice(-3)}`,
    ztsf_deal_desc: `${co.entity}_${comm}_${model}_${round(usd / 1000000, 3)}M`,
    ztsf_deal_type: pick(['Booking', 'Booking', 'Rollover', 'Offset Rollover']),
    zolam_deal_no: `OLM-2026-${pad(7100 + i * 13, 5)}`,
    ztsf_trftype: pick(['T1', 'T2', 'T3']),
    ztsf_trftype2: pick(['S', 'P']),
    ztsf_exe_co: pick(['OGA', 'DMCC', co.entity]),
    fo_remark: pick([`Hedge for ${comm} import`, 'Customer-driven cover', 'Roll of maturing hedge', 'Booked as per treasury policy', `Cover for ${comm} shipment`]),
    mo_remark: pick(['Checked', 'Rate verified', 'Confirmation matched', '']),
    zpl: next() < 0.5 ? round(between(-18000, 24000), 2) : 0,
    zpl_curr: 'USD',
    zpl_rate: 0,
    zpl_lamt: 0,
    zpl_lcurr: co.currency,
    dcrdat: dateOffset(blotter, 0),
    cruser: trader.id,
    tcrtim: `${pad(8 + Math.floor(next() * 8), 2)}:${pad(Math.floor(next() * 60), 2)}:${pad(Math.floor(next() * 60), 2)}`,
    dupdat: dateOffset(blotter, 0),
    upuser: trader.id,
    tuptim: `${pad(9 + Math.floor(next() * 8), 2)}:${pad(Math.floor(next() * 60), 2)}:${pad(Math.floor(next() * 60), 2)}`,
  }
  return { co, trade, comm, dealNo, tsfDealNo, usd, c }
}

function spotFor(rng: Rng, cur: string): number {
  if (cur === 'INR') return rng.between(88.2, 89.6)
  if (cur === 'THB') return rng.between(33.4, 34.7)
  return rng.between(25300, 25800)
}

function swapPointsFor(cur: string, spot: number, tenor: number): number {
  const annual = cur === 'INR' ? 0.023 : cur === 'THB' ? 0.004 : 0.015
  return (spot * annual * tenor) / 365
}

export function generateFxDeals(rng: Rng): Deal[] {
  const seq = ['IN11', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'VN10', 'IN11', 'IN11', 'TH10', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'VN10', 'IN11']
  const out: Deal[] = []
  seq.forEach((cc, i) => {
    const status = i % 4 === 3 || i === 2 || i === 14 ? '13' : '07'
    const b = buildCommon(rng, i, cc, status, 'FX')
    const types = FX_TXN_TYPES[cc] as TxnTypeOption[]
    const tt = types[i % types.length] as TxnTypeOption
    const cur2 = b.co.currency
    const dp = cur2 === 'VND' ? 2 : 4
    const tenor = rng.pick([30, 60, 90, 120, 180])
    const spot = round(spotFor(rng, cur2), dp)
    const swap = round(swapPointsFor(cur2, spot, tenor), dp)
    const allIn = round(spot + swap, dp)
    const buy = i % 3 !== 0
    const amt1 = b.usd
    const amt2 = round(amt1 * allIn, 2)
    const d = b.c
    d.sgsart = 'FXT'
    d.ltx = 'FX Transaction'
    d.sanlf = '600'
    d.sfgtyp = '001'
    d.sfhaart = tt.code
    d.xtext = tt.text
    d.objnr = `HF${pad(b.dealNo, 10)}${b.co.code}`
    d.refnr = pad(b.tsfDealNo, 10)
    d.v_date = dateOffset(b.trade, 0)
    d.delfz = dateOffset(b.trade, tenor)
    d.bs = buy ? '1' : '2'
    d.bs_o = d.bs
    d.bs_1 = buy ? 'Buy' : 'Sell'
    d.bs_2 = buy ? 'Sell' : 'Buy'
    d.curr1 = 'USD'
    d.amt1 = amt1
    d.curr2 = cur2
    d.amt2 = amt2
    d.curr_st1 = buy ? 'USD' : cur2
    d.zamt_st1 = buy ? amt1 : amt2
    d.curr_st2 = buy ? cur2 : 'USD'
    d.zamt_st2 = buy ? amt2 : amt1
    d.cpair = `USD/${cur2}`
    d.zsett_pair = `USD/${cur2}`
    d.f_curr1 = 'USD'
    d.t_curr1 = cur2
    d.spot = spot
    d.swap = swap
    d.tot_rate = allIn
    d.t_rate = allIn
    d.ospot = spot
    d.oswap = swap
    d.otot_rate = allIn
    if (tt.code === '130') {
      d.ndf_date = dateOffset(String(d.delfz), -2)
      d.ndf_rate = round(allIn + rng.between(-0.4, 0.4), 4)
      d.ndf_ref = `FIX/${b.co.entity}/${pad(2600 + i, 4)}`
      d.cash_curr = 'USD'
      d.zcash_amt = round(amt1 * 0.012, 2)
      d.ndf_fo_rem = 'Fixing as per RBI reference rate'
      d.ndf_mo_rem = ''
    } else {
      d.ndf_date = ''
      d.ndf_rate = 0
      d.ndf_ref = ''
      d.cash_curr = ''
      d.zcash_amt = 0
      d.ndf_fo_rem = ''
      d.ndf_mo_rem = ''
    }
    const zpl = Number(d.zpl)
    d.zpl_rate = zpl ? allIn : 0
    d.zpl_lamt = zpl ? round(zpl * allIn, 2) : 0
    d.zuonr = `FP-2026-${pad(10 + (i % 9), 3)}`
    d.zsubject = `Hedge ${b.comm}`
    out.push(d)
  })
  return out
}

export function generateOpDeals(rng: Rng): Deal[] {
  const seq = ['IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10', 'IN11', 'TH10', 'IN11', 'VN10']
  const out: Deal[] = []
  seq.forEach((cc, i) => {
    const status = i % 4 === 2 || i === 9 ? '13' : '07'
    const b = buildCommon(rng, i, cc, status, 'OP')
    const tt = OP_TXN_TYPES[i % OP_TXN_TYPES.length] as TxnTypeOption
    const cur2 = b.co.currency
    const dp = cur2 === 'VND' ? 2 : 4
    const tenor = rng.pick([30, 45, 60, 90, 120])
    const spot = spotFor(rng, cur2)
    const strike = round(spot * (1 + rng.between(-0.015, 0.02)), dp)
    const isCall = i % 2 === 0
    const amt1 = b.usd
    const amt2 = round(amt1 * strike, 2)
    const d = b.c
    d.sgsart = 'FXO'
    d.ltx = 'FX Option'
    d.sfhaart = tt.code
    d.xtext = tt.text
    d.delfz = dateOffset(b.trade, tenor + 2)
    d.e_date = dateOffset(b.trade, tenor)
    d.e_type = 'European'
    d.s_type = cur2 === 'INR' ? 'Cash' : 'Physical'
    d.settlfl = cur2 === 'INR' ? 'X' : ''
    d.sputcal = isCall ? 'Call' : 'Put'
    d.soptaus = 'Vanilla'
    d.pc1 = isCall ? 'C' : 'P'
    d.pc2 = isCall ? 'P' : 'C'
    d.kkurs = strike
    d.exp_rate = 0
    d.expiry_location = cur2 === 'INR' ? 'Mumbai' : cur2 === 'THB' ? 'Bangkok' : 'Ho Chi Minh City'
    d.expiry_time = '14:30:00'
    d.loc_code_text = d.expiry_location
    d.curr1 = 'USD'
    d.amt1 = amt1
    d.curr2 = cur2
    d.amt2 = amt2
    d.cpair = `USD/${cur2}`
    d.f_curr1 = 'USD'
    d.t_curr1 = cur2
    d.bzbetr = round(amt1 * rng.between(0.003, 0.011), 2)
    d.wzbetr = 'USD'
    d.dzterm = dateOffset(b.trade, 2)
    d.pwkurs = round(spot, dp)
    if (cur2 === 'INR') {
      d.cs_date = d.e_date
      d.cs_amt = round(amt1 * 0.004, 2)
      d.cs_curr = 'USD'
      d.cs_rate = strike
    } else {
      d.cs_date = ''
      d.cs_amt = 0
      d.cs_curr = ''
      d.cs_rate = 0
    }
    const zpl = Number(d.zpl)
    d.zpl_rate = zpl ? strike : 0
    d.zpl_lamt = zpl ? round(zpl * strike, 2) : 0
    out.push(d)
  })
  return out
}

/** The whole demo dataset: one RNG stream feeds FX then Options, from the same seed every time. */
export function loadAllDeals(): Record<TxnType, Deal[]> {
  const rng = makeRng(RNG_SEED)
  const FX = generateFxDeals(rng)
  const OP = generateOpDeals(rng)
  return { FX, OP }
}
