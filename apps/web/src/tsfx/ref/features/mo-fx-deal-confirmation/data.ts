/**
 * Seed data, from the legacy page's "DUMMY DATA" block. The page never called an API: every
 * list here stands in for an SAP value help or the deal table behind ZSGTSFR024, and is kept
 * in this one file so swapping it for a real service later touches nothing else.
 *
 * The original drew its deals from Math.random, so every page load showed different rows.
 * Here the same generator runs off a small seeded PRNG instead: the shape is identical (17
 * fixed Deal IDs then 38 random ones, ~22% Options, 80% Unmatched / 20% Correction Required)
 * but the rows are stable across loads and testable.
 */
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'
import { addDays } from './format.ts'
import type { Column, CompanyInfo, Deal, DealStatus, DealType, Partner, Trader, TxnType } from './types.ts'

export const COMPANY_CODES = ['SG03', 'AE13', 'AE11', 'IN11']

export const COMPANY_INFO: Record<string, CompanyInfo> = {
  SG03: { companyName: 'SG03 - Olam Global Agri Pte. Ltd.', group: 'G03 - TSF - SEA', profitCenter: 'SG032003 - TSF-FX', businessArea: '0254 - OLAM (THAILAND) LIMITED' },
  AE13: { companyName: 'AE13 - Olam Agri Gulf FZE', group: 'G05 - TSF - MEA', profitCenter: 'AE132001 - TSF-FX', businessArea: '0512 - OLAM AGRI UAE LIMITED' },
  AE11: { companyName: 'AE11 - Olam Agri India Pvt Ltd', group: 'G02 - TSF - India', profitCenter: 'AE112004 - TSF-FX', businessArea: '0330 - OLAM AGRI INDIA LIMITED' },
  IN11: { companyName: 'IN11 - Olam Agri India Pvt Ltd', group: 'G02 - TSF - India', profitCenter: 'IN112004 - TSF-FX', businessArea: '0330 - OLAM AGRI INDIA LIMITED' },
}

export const PARTNERS: Partner[] = [
  { code: '0660000645', name: 'DBS BANK LTD' },
  { code: '0660000683', name: 'J.P. Morgan Chase Bank' },
  { code: '0660000680', name: 'STANDARD CHARTERED BANK SINGAPORE' },
  { code: '0660000806', name: 'CITIBANK' },
  { code: '0660012172', name: 'BARCLAYS BANK PLC' },
  { code: '0660012173', name: 'JPMORGAN CHASE BANK NA SINGAPORE' },
]

export const TXN_TYPES: TxnType[] = [
  { code: '619', desc: 'Forward-TSF' },
  { code: '609', desc: 'Settlement Spot - TSF' },
  { code: '604', desc: 'Spot- Exercise Option TSF' },
  { code: '631', desc: 'NDF-TSF' },
  { code: '605', desc: 'Spot- TSF' },
]

/**
 * The SAP transaction type value help, for naming a deal read from SAP. TXN_TYPES above stays the
 * dummy list for the Options rows; a code missing here shows as the bare code.
 */
export const SAP_TXN_DESC: Record<string, string> = {
  '600': 'FX Spot: External-Spot',
  '601': 'FX Spot: External-Cash',
  '602': 'FX Spot: External-TOM',
  '603': 'FX Spot: External-Spot-Exercis',
  '604': 'FX Spot: External-Spot-Exercis',
  '605': 'FX Spot: External-Spot - TSF',
  '607': 'FX Spot: External-Cash - TSF',
  '609': 'FX Spot: External-Settlement S',
  '619': 'FX Forwards: External-Forward',
  '631': 'FX NDF: External-NDF - TSF',
  '632': 'FX NDF: External-DNDF - TSF',
}

export const TRADERS: Trader[] = [
  { code: 'C27', name: 'Akshay Mohnot', shortName: 'Akshay M' },
  { code: 'C33', name: 'Pooja Pednekar', shortName: 'Pooja P' },
  { code: 'C28', name: 'Nidhi Singh', shortName: 'Nidhi S' },
  { code: 'V12', name: 'CHARUTHA V', shortName: 'CHARUTHA V' },
]

export const CCY_PAIRS: Array<[string, string]> = [
  ['USD', 'THB'],
  ['USD', 'INR'],
  ['USD', 'EUR'],
  ['SGD', 'USD'],
  ['USD', 'AED'],
]

export const STATUS = {
  UNMATCHED: 'FO->MO: Unmatched',
  CORRECTION: 'MO->FO: Correction Required',
  CORRECTED: 'FO: Error Correction - Corrected',
  MATCHED: 'Matched & Released',
} as const satisfies Record<string, DealStatus>

/** The wording of a workflow status (TXN_STATUS) on this screen. */
export function dealStatusOf(txnStatus: string): DealStatus {
  if (txnStatus === FX_TXN_STATUS.MO_TO_FO_CORRECTION) return STATUS.CORRECTION
  if (txnStatus === FX_TXN_STATUS.CORRECTED) return STATUS.CORRECTED
  if (txnStatus === FX_TXN_STATUS.MO_MATCH_RELEASE || txnStatus === FX_TXN_STATUS.OFFSET_TRANSACTION) return STATUS.MATCHED
  return STATUS.UNMATCHED
}

export const STATUSES: DealStatus[] = [STATUS.UNMATCHED, STATUS.CORRECTION, STATUS.CORRECTED, STATUS.MATCHED]

/** Verbatim from the page — note 1100000916 appears twice, as it did there. */
export const FIXED_DEAL_IDS = [
  '1100000999', '1100000959', '1100000941', '1100000916', '1100000843',
  '1100000564', '1100000562', '1100000554', '1100000916', '1100000912',
  '1100000832', '1100000830', '1100000829', '1100000560', '1100000558',
  '1100000552', '1100000548',
]

export const RANDOM_DEAL_COUNT = 38

export const SAMPLE_REMARKS = [
  'Incorrect fixing date',
  'Wrong value date',
  'Rate mismatch with bank confirmation',
  'Please verify counterparty account',
  'Amount does not match SWIFT confirmation',
]

const OPTION_TXN: TxnType = { code: '604', desc: 'Spot- Exercise Option TSF' }

/** The deal table's columns, in the page's order. Only those marked sortable take a header click. */
export const COLUMNS: Column[] = [
  { key: 'select', label: '' },
  { key: 'dealId', label: 'Deal ID', sortable: true },
  { key: 'coCode', label: 'CoCode', sortable: true },
  { key: 'transaction', label: 'Transaction', sortable: true },
  { key: 'partnerName', label: 'Partner Name', sortable: true },
  { key: 'txnTypeDesc', label: 'Transaction Type Description' },
  { key: 'tradeDate', label: 'Trade Date', sortable: true, type: 'date' },
  { key: 'buySell1', label: 'Buy/Sell 1' },
  { key: 'currency1', label: 'Currency 1', sortable: true },
  { key: 'amount1', label: 'Amount 1', sortable: true, type: 'amount' },
  { key: 'buySell2', label: 'Buy/Sell 2' },
  { key: 'currency2', label: 'Currency 2' },
  { key: 'amount2', label: 'Amount 2', type: 'amount' },
  { key: 'fixingDate', label: 'Fixing Date', sortable: true, type: 'date' },
  { key: 'valueDate', label: 'Value Date', sortable: true, type: 'date' },
  { key: 'allInRate', label: 'All in Rate', type: 'rate' },
  { key: 'status', label: 'Txn Status Desc', sortable: true },
  { key: 'traderName', label: 'Trader Name', sortable: true },
  { key: 'groupDesc', label: 'Group Description' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'profitCenterDesc', label: 'Profit Center Description' },
  { key: 'businessAreaDesc', label: 'Business Area Description' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'traderShort', label: 'Trader' },
  { key: 'fixRefId', label: 'Fix.Ref.ID' },
  { key: 'ndfRate', label: 'NDF Settlement Rate', type: 'rate' },
  { key: 'cashAmount', label: 'Cash Settlement Amount', type: 'amount' },
  { key: 'cashCurrency', label: 'Cash Currency' },
  { key: 'foRemark', label: 'FO Remark' },
  { key: 'moRemark', label: 'MO Remark' },
]

// ---------------------------------------------------------------- seeded random

export const DEFAULT_SEED = 20260926

/** mulberry32: a tiny deterministic stand-in for Math.random, uniform on [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number

const randInt = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min

function randomFrom<T>(rng: Rng, arr: readonly T[]): T {
  const v = arr[randInt(rng, 0, arr.length - 1)]
  if (v === undefined) throw new Error('randomFrom: empty list')
  return v
}

const randomDate = (rng: Rng, startYear: number, endYear: number) => {
  const y = randInt(rng, startYear, endYear)
  const mo = randInt(rng, 0, 11)
  const da = randInt(rng, 1, 28)
  return new Date(y, mo, da)
}

// ---------------------------------------------------------------- generation

/** The page's buildDeal, drawing from `rng` in the same order it drew from Math.random. */
function buildDeal(rng: Rng, dealType: DealType, seq: number, idOverride?: string): Deal {
  const coCode = randomFrom(rng, COMPANY_CODES)
  const info = COMPANY_INFO[coCode]
  if (!info) throw new Error(`no company info for ${coCode}`)
  const partner = randomFrom(rng, PARTNERS)
  const txnType = dealType === 'Options' ? OPTION_TXN : randomFrom(rng, TXN_TYPES.filter((t) => t.code !== '604'))
  const [ccy1, ccy2] = randomFrom(rng, CCY_PAIRS)
  const bs1 = randomFrom(rng, ['Buy', 'Sell'])
  const bs2 = bs1 === 'Buy' ? 'Sell' : 'Buy'
  const amt1 = randInt(rng, 1000, 50000000) + rng()
  const rate = ccy2 === 'THB' ? 30 + rng() * 6 : ccy2 === 'INR' ? 80 + rng() * 15 : 0.85 + rng() * 0.3
  const amt2 = amt1 * rate
  const tradeDate = randomDate(rng, 2024, 2026)
  const fixingDate = addDays(tradeDate, randInt(rng, 30, 400))
  const valueDate = addDays(fixingDate, randInt(rng, 0, 2))
  const trader = randomFrom(rng, TRADERS)
  // Newly generated deals always start in the open MO queue (Unmatched or Correction
  // Required). "Matched & Released" is only reached through the Match & Release action, at
  // which point the deal leaves this queue.
  const status: DealStatus = rng() < 0.8 ? STATUS.UNMATCHED : STATUS.CORRECTION
  const moRemark = status === STATUS.CORRECTION ? randomFrom(rng, SAMPLE_REMARKS) : ''

  const id = idOverride || String(1100000000 + randInt(rng, 100, 999999))
  return {
    id,
    // The sample rows' id is their Deal ID.
    dealId: id,
    dealType,
    coCode,
    // nextTransactionRef: "6205000" + a six-digit running number from 000001.
    transaction: `6205000${String(1000000 + seq).slice(1)}`,
    partnerCode: partner.code,
    partnerName: `${partner.code} - ${partner.name}`,
    txnTypeCode: txnType.code,
    txnTypeDesc: `${txnType.code} - ${txnType.desc}`,
    tradeDate,
    buySell1: bs1,
    currency1: ccy1,
    amount1: bs1 === 'Sell' ? -amt1 : amt1,
    buySell2: bs2,
    currency2: ccy2,
    amount2: bs2 === 'Sell' ? -amt2 : amt2,
    fixingDate,
    valueDate,
    allInRate: rate,
    status,
    txnStatus: status === STATUS.CORRECTION ? FX_TXN_STATUS.MO_TO_FO_CORRECTION : FX_TXN_STATUS.FO_TO_MO_UNMATCHED,
    traderCode: trader.code,
    traderName: `${trader.code} - ${trader.name}`,
    traderShort: trader.shortName,
    groupDesc: info.group,
    companyName: info.companyName,
    profitCenterDesc: info.profitCenter,
    businessAreaDesc: info.businessArea,
    accounting: '1000 - Trade',
    assignment: rng() < 0.3 ? 'FXALL' : '',
    fixRefId: '',
    foRemark: '',
    moRemark,
  }
}

/** The page's generateDeals: every fifth fixed ID is an Option, then 38 random deals. */
export function generateDeals(seed: number = DEFAULT_SEED): Deal[] {
  const rng = createRng(seed)
  let seq = 1
  const deals: Deal[] = []
  FIXED_DEAL_IDS.forEach((id, idx) => {
    deals.push(buildDeal(rng, idx % 5 === 0 ? 'Options' : 'FX', seq++, id))
  })
  for (let i = 0; i < RANDOM_DEAL_COUNT; i++) {
    deals.push(buildDeal(rng, rng() < 0.22 ? 'Options' : 'FX', seq++))
  }
  return deals
}
