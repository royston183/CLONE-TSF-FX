/*
 * TEST FIXTURES ONLY. The seeded demo dataset the page ran on before it was wired to SAP. It is
 * imported by logic.test.ts and nothing else: the page itself never lists sample deals (see api.ts).
 *
 * The deals come from a deterministic pseudo-random generator, seeded the same way on every call.
 */
import { dateOffset, pad, round } from './format.ts'
import type { Company, Deal, Partner, Trader, TxnType, TxnTypeOption } from './types.ts'
import type { StatusSelection } from './logic.ts'

export const DEMO_TODAY = '05-10-2026'
export const RNG_SEED = 20261005

export const COMPANY_CODES: Company[] = [
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd', entity: 'OSIPL', currency: 'INR', pc: 'IN11PC01', pcName: 'Agri Trading India', ba: 'IN01', baName: 'Agri Commodities India', portfolio: 'FXHDG-IN', acct: 'Hedge - Cash Flow' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd', entity: 'OTL', currency: 'THB', pc: 'TH10PC01', pcName: 'Rice Trading Thailand', ba: 'TH01', baName: 'Rice & Grains Thailand', portfolio: 'FXHDG-TH', acct: 'Hedge - Cash Flow' },
  { code: 'VN10', name: 'Olam Vietnam Limited', entity: 'OVL', currency: 'VND', pc: 'VN10PC01', pcName: 'Agri Trading Vietnam', ba: 'VN01', baName: 'Agri Commodities Vietnam', portfolio: 'FXHDG-VN', acct: 'Hedge - Fair Value' },
]


/** The fixture's authorised company codes (the page reads T001; AUTHORITY-CHECK is WAITING FOR AUTH). */
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

/** Dummy External Status texts of the fixture deals. */
const FIXTURE_STATUS_TEXT: Record<string, string> = { '07': 'Confirmed by MO', '13': 'Pending Settlement' }

/**
 * The status selection the live ZGTCATR_PARAM row (ZSGTSF_RDEAL_TRD_INV / SG03 / MAPID A:
 * PARAM1 'M040', PARAM3 '9918307') yields: statuses 59, 07, 13 and activity >= 2.
 */
export const FIXTURE_SELECTION: StatusSelection = { fx: ['59', '07', '13'], actvt: 2, found: true }

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
    ext_stat_desc: FIXTURE_STATUS_TEXT[status] ?? '',
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
