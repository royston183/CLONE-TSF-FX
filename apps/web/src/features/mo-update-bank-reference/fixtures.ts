// TEST FIXTURES ONLY — imported by logic.test.ts, never by the screen. The legacy page's dummy
// masters and its seeded deal generator, kept so the table/CSV logic can be tested offline.
import { fmtDate, pad } from './format.ts'
import type { Company, Deal, DealType } from './types.ts'

type FxPair = { pair: string; c1: string; c2: string; spot: number }
type Coded = { code: string; name: string }
type TxnType = { code: string; desc: string }

export const COMPANIES: readonly Company[] = [
  { code: 'AE13', name: 'Olam International DMCC' },
  { code: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U' },
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd' },
  { code: 'SG10', name: 'Olam Global Holdings Pte Ltd' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd' },
  { code: 'US15', name: 'Olam Americas Inc' },
  { code: 'VN10', name: 'Olam Vietnam Limited' },
]

const FX_PAIRS: readonly FxPair[] = [
  { pair: 'USD/INR', c1: 'USD', c2: 'INR', spot: 87.15 },
  { pair: 'USD/THB', c1: 'USD', c2: 'THB', spot: 34.2 },
  { pair: 'USD/VND', c1: 'USD', c2: 'VND', spot: 25150.0 },
  { pair: 'EUR/USD', c1: 'EUR', c2: 'USD', spot: 1.087 },
  { pair: 'USD/AED', c1: 'USD', c2: 'AED', spot: 3.6725 },
  { pair: 'USD/SGD', c1: 'USD', c2: 'SGD', spot: 1.312 },
  { pair: 'USD/CNH', c1: 'USD', c2: 'CNH', spot: 7.18 },
]

const TRADERS: readonly Coded[] = [
  { code: 'SKHAN', name: 'S. Khan' },
  { code: 'SALVA', name: 'S. Alva' },
  { code: 'RGUPTA', name: 'R. Gupta' },
  { code: 'NPATEL', name: 'N. Patel' },
  { code: 'MTAN', name: 'M. Tan' },
]

const PARTNERS: readonly Coded[] = [
  { code: 'P100234', name: 'HSBC' },
  { code: 'P100567', name: 'Citi' },
  { code: 'P100812', name: 'Standard Chartered' },
  { code: 'P101045', name: 'JPMorgan' },
  { code: 'P101390', name: 'Deutsche Bank' },
]

const FX_TXN_TYPES: readonly TxnType[] = [
  { code: 'FWD', desc: 'Forward' },
  { code: 'SPT', desc: 'Spot' },
  { code: 'SWP', desc: 'FX Swap' },
  { code: 'NDF', desc: 'Non-Deliverable Forward' },
]

const OP_TXN_TYPES: readonly TxnType[] = [
  { code: 'CALL', desc: 'Call Option' },
  { code: 'PUT', desc: 'Put Option' },
  { code: 'CPCB', desc: 'Call & Put Combo' },
]

const TXN_STATUSES = ['Active', 'Pending', 'Settled'] as const
const MATCH_STATUSES = ['Matched', 'Unmatched'] as const
const PORTFOLIOS: readonly Coded[] = [
  { code: 'P0010', name: 'Trading Book' },
  { code: 'P0020', name: 'Hedging Book' },
  { code: 'P0030', name: 'Treasury Book' },
]
const PROFIT_CENTERS: readonly string[] = ['PC-1001', 'PC-1002', 'PC-1003', 'PC-2001']
const BUSINESS_AREAS: readonly string[] = ['BA01', 'BA02', 'BA03']

export function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T
}
function rnd(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}
function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rnd(rng, min, max + 1))
}

/** Fixture companies whose code lies in [from, to] (swapped if reversed); none without a From. */
export function companiesInRange(from: string, to: string): Company[] {
  if (!from) return []
  let lo = from
  let hi = to || from
  if (hi < lo) {
    const t = lo
    lo = hi
    hi = t
  }
  return COMPANIES.filter((c) => c.code >= lo && c.code <= hi)
}

function buildRow(co: Company, dealType: DealType, keyDateStr: string, withRef: boolean, rng: () => number, idx: number): Deal {
  const isFx = dealType === 'FX'
  const pairInfo = pick(FX_PAIRS, rng)
  const txnType = pick(isFx ? FX_TXN_TYPES : OP_TXN_TYPES, rng)
  const trader = pick(TRADERS, rng)
  const partner = pick(PARTNERS, rng)
  const portfolio = pick(PORTFOLIOS, rng)
  const tradeDate = new Date(keyDateStr + 'T00:00:00')
  tradeDate.setDate(tradeDate.getDate() - rndInt(rng, 3, 45))
  const rfha = '5' + pad(hashCode(co.code + idx + keyDateStr) % 100000000, 8)
  const amt1 = Math.round(rnd(rng, 50000, 4500000) * 100) / 100
  const row: Deal = {
    _id: rfha + '-' + co.code,
    RFHA: rfha,
    BUKRS: co.code,
    BUTXT: co.name,
    SFHAART: txnType.code,
    XTEXT: txnType.desc,
    CPAIR: pairInfo.pair,
    BS_1: rng() > 0.5 ? 'Buy' : 'Sell',
    CURR1: pairInfo.c1,
    AMT1: amt1,
    DBLFZ: fmtDate(tradeDate),
    DELFZ: fmtDate(new Date(keyDateStr + 'T00:00:00')),
    RDEALER: trader.code,
    BP_NAME: partner.name,
    KONTRH: partner.code,
    RBUSA: pick(BUSINESS_AREAS, rng),
    RPORTB: portfolio.code,
    PRCTR: pick(PROFIT_CENTERS, rng),
    TXN_STATUS: pick(TXN_STATUSES, rng),
    MAT_UNMAT: pick(MATCH_STATUSES, rng),
    ZTSF_DEAL_ID: 'TSF' + pad((hashCode(rfha + 'D') % 900000) + 100000, 6),
    ZMC_REF_NO: rng() > 0.35 ? 'MC' + pad((hashCode(rfha + 'M') % 9000000) + 1000000, 7) : '',
    NORDEXT: withRef ? 'EXT-' + co.code + '-' + pad((hashCode(rfha + 'X') % 9000) + 1000, 4) : '',
    ZOLAM_DEAL_NO: rng() > 0.7 ? 'OLM' + pad((hashCode(rfha + 'O') % 90000) + 10000, 5) : '',
    _checked: false,
  }
  if (isFx) {
    row.BS_2 = row.BS_1 === 'Buy' ? 'Sell' : 'Buy'
    row.CURR2 = pairInfo.c2
    row.AMT2 = Math.round(amt1 * pairInfo.spot * 100) / 100
    row.SPOT = pairInfo.spot
    row.SWAP = Math.round(rnd(rng, -0.85, 0.85) * 10000) / 10000
    row.TOT_RATE = Math.round((row.SPOT + row.SWAP) * 10000) / 10000
  } else {
    row.OPTION_TYPE = txnType.desc
    row.STRIKE_RATE = Math.round(pairInfo.spot * rnd(rng, 0.97, 1.03) * 10000) / 10000
    row.PREMIUM_AMT = Math.round(rnd(rng, 500, 45000) * 100) / 100
    row.PREMIUM_CURR = pairInfo.c1
    const exp = new Date(keyDateStr + 'T00:00:00')
    exp.setMonth(exp.getMonth() + rndInt(rng, 1, 9))
    row.EXPIRY_DATE = fmtDate(exp)
  }
  return row
}

/** 2-5 fixture deals per company in range, seeded by the whole selection. keyDateStr is YYYY-MM-DD. */
export function generateDeals(dealType: DealType, coFrom: string, coTo: string, keyDateStr: string, withRef: boolean): Deal[] {
  const companies = companiesInRange(coFrom, coTo)
  if (companies.length === 0 || !keyDateStr) return []
  const seed = hashCode([dealType, coFrom, coTo, keyDateStr, withRef].join('|'))
  const rng = mulberry32(seed)
  const rows: Deal[] = []
  companies.forEach((co, ci) => {
    const n = rndInt(rng, 2, 5)
    for (let i = 0; i < n; i++) rows.push(buildRow(co, dealType, keyDateStr, withRef, rng, ci * 100 + i))
  })
  return rows
}
