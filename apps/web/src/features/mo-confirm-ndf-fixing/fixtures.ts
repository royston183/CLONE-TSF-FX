/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen.
 *
 * The legacy page's "DUMMY DATA" block (company codes, business areas, partners, traders and the
 * deterministic xorshift deal generator), plus its ensureDataForCriteria top-up. ZSGTSFR026's ABAP
 * source is not exported, so the screen shows WAITING FOR API instead of these rows; they survive
 * here so the pure selection / filter / sort / paging rules can still be tested.
 */
import { STATUS, STATUSES } from './data.ts'
import { addDays, formatDMY, parseDMY } from './format.ts'
import type { BusinessArea, NdfDeal, NdfStatus, Partner, Trader } from './types.ts'

export const COMPANY_CODES = ['SG03', 'AE13', 'AE11']

export const BUSINESS_AREAS: BusinessArea[] = [
  { code: 'SG01', name: 'Singapore Trading' },
  { code: 'AE01', name: 'UAE Trading' },
  { code: 'AE02', name: 'Abu Dhabi Treasury' },
]

export const TSF_ENTITIES = ['OSIPL', 'OTL', 'OVL']

export const PARTNERS: Partner[] = [
  { code: '0660000645', name: 'DBS BANK LTD' },
  { code: '0660000683', name: 'J.P. Morgan Chase Bank' },
  { code: '0660000680', name: 'STANDARD CHARTERED BANK SINGAPORE' },
  { code: '0660000806', name: 'CITIBANK' },
  { code: '0660012172', name: 'BARCLAYS BANK PLC' },
]

export const TRADERS: Trader[] = [
  { code: 'C27', name: 'Akshay Mohnot' },
  { code: 'C33', name: 'Pooja Pednekar' },
  { code: 'C28', name: 'Nidhi Singh' },
  { code: 'V12', name: 'CHARUTHA V' },
]

export const CCY_PAIRS = ['INR', 'THB', 'IDR', 'PHP', 'KRW', 'CNY']

export const TXN_TYPE_DESC = '631 - NDF-TSF'

export const FIXING_DATE_POOL = ['28-09-2027', '30-09-2027', '15-10-2027', '31-10-2027', '29-11-2027']

const RATE_BASE: Record<string, number> = { INR: 83, THB: 34, IDR: 15600, PHP: 56, KRW: 1330, CNY: 7.15 }

const CORRECTION_REMARKS = [
  'Incorrect fixing rate',
  'Please correct the fixing date',
  'Rate mismatch with counterparty confirmation',
  'Value date discrepancy noted',
]

/** How many random rows generateNdfDeals layers over the guaranteed combinations. */
const EXTRA_DEALS = 15

// ---------------------------------------------------------------- deterministic pseudo-random

export const SEED = 88172645

export type Rng = {
  /** [0, 1), in steps of 1/100000. */
  rnd: () => number
  /** An integer in [min, max]. */
  rndInt: (min: number, max: number) => number
  pick: <T>(arr: readonly T[]) => T
}

/** The page's xorshift generator, byte for byte, with its seed held per instance. */
export function createRng(seed: number = SEED): Rng {
  let s = seed
  const rnd = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s < 0 ? ~s + 1 : s) % 100000) / 100000
  }
  const rndInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
  const pick = <T,>(arr: readonly T[]): T => {
    const v = arr[rndInt(0, arr.length - 1)]
    if (v === undefined) throw new Error('pick from an empty list')
    return v
  }
  return { rnd, rndInt, pick }
}

// ---------------------------------------------------------------- deals

/** One NDF deal; draws from the generator in exactly the page's order. */
export function buildDeal(rng: Rng, idx: number, coCode: string, fixingDateStr: string, status: NdfStatus): NdfDeal {
  const { rnd, rndInt, pick } = rng
  const ba = pick(BUSINESS_AREAS)
  const tsf = pick(TSF_ENTITIES)
  const partner = pick(PARTNERS)
  const trader = pick(TRADERS)
  const ccy2 = pick(CCY_PAIRS)

  const fixingDate = parseDMY(fixingDateStr)
  const tradeDate = addDays(fixingDate, -rndInt(120, 420))
  const valueDate = addDays(fixingDate, rndInt(1, 3))

  const amount1 = rndInt(50, 5000) * 1000 + rndInt(0, 99) * 10
  const rateBase = RATE_BASE[ccy2] || 50
  const rate = +(rateBase * (0.97 + rnd() * 0.06)).toFixed(4)
  const amount2 = +(amount1 * rate).toFixed(2)

  const dealId = '11' + String(rndInt(10000000, 99999999))
  const transaction = '50000' + String(rndInt(10000, 99999))
  const mcRef = '20000' + String(rndInt(10000, 99999))
  const buySell2 = rnd() < 0.5 ? 'Buy' : 'Sell'
  const accounting = rnd() < 0.7 ? 'Not Posted' : 'Posted'
  const externalRef = status === STATUS.RELEASED ? 'EXT-' + rndInt(10000, 99999) : ''
  const moRemark = status === STATUS.CORRECTION ? pick(CORRECTION_REMARKS) : ''

  return {
    id: 'd' + idx,
    transaction,
    coCode,
    busArea: ba.code,
    tradeDate: formatDMY(tradeDate),
    tsfEntity: tsf,
    txnTypeDesc: TXN_TYPE_DESC,
    partnerName: partner.name,
    partnerCode: partner.code,
    buySell2,
    currency2: ccy2,
    amount2,
    currency1: 'USD',
    amount1,
    allInRate: rate,
    txnStatus: status,
    fixingDate: fixingDateStr,
    ndfValue: amount1,
    valueDate: formatDMY(valueDate),
    dealId,
    mcReference: mcRef,
    businessArea: ba.name,
    trader: trader.name,
    traderCode: trader.code,
    accounting,
    externalRef,
    internalRef: '',
    foRemark: '',
    moRemark,
  }
}

/**
 * Every Company Code x Fixing Date x Status combination gets at least one record, so any
 * Basic Selection / filter combination used for testing returns data; then extra random
 * records are layered on top for realistic volume and variety.
 */
export function generateNdfDeals(rng: Rng): NdfDeal[] {
  const deals: NdfDeal[] = []
  let idx = 0
  for (const coCode of COMPANY_CODES) {
    for (const fixingDateStr of FIXING_DATE_POOL) {
      for (const status of STATUSES) {
        deals.push(buildDeal(rng, idx, coCode, fixingDateStr, status))
        idx++
      }
    }
  }
  for (let i = 0; i < EXTRA_DEALS; i++) {
    const coCode = rng.pick(COMPANY_CODES)
    const fixingDateStr = rng.pick(FIXING_DATE_POOL)
    const status = rng.pick(STATUSES)
    deals.push(buildDeal(rng, idx, coCode, fixingDateStr, status))
    idx++
  }
  return deals
}

/**
 * A freshly loaded page: the seeded deals, plus the generator in the state they left it, which
 * ensureDataForCriteria keeps drawing from.
 */
export function createNdfDataset(seed: number = SEED): { rng: Rng; deals: NdfDeal[] } {
  const rng = createRng(seed)
  return { rng, deals: generateNdfDeals(rng) }
}

/**
 * Guarantees that whatever Company Code + Fixing Date the user tests with, a handful of deals
 * (3–5, cycling through all three statuses) exist for it. Returns the same list when some do.
 */
export function ensureDataForCriteria(deals: NdfDeal[], rng: Rng, coCode: string, fixingDateStr: string): NdfDeal[] {
  const ccUpper = coCode.trim().toUpperCase()
  const already = deals.some((d) => d.coCode.toUpperCase() === ccUpper && d.fixingDate === fixingDateStr)
  if (already) return deals
  const next = deals.slice()
  const n = rng.rndInt(3, 5)
  for (let i = 0; i < n; i++) {
    const status = STATUSES[i % STATUSES.length] ?? STATUS.UNMATCHED
    next.push(buildDeal(rng, next.length + rng.rndInt(1000, 999999), ccUpper, fixingDateStr, status))
  }
  return next
}

