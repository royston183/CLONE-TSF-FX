/*
 * Dummy data, quarantined here exactly as the legacy page defined it. Nothing outside this
 * file invents deals, partners or txn types; swap this module for a backend call later.
 */
import type { Leg } from './types.ts'

export const TXN_TYPE_LABEL: Readonly<Record<string, string>> = {
  '605': 'Spot',
  '619': 'Forward',
  '631': 'Option',
  '607': 'Cash',
  '608': 'Tom',
}

export const BP_MASTER: readonly { bp: string; shortName: string }[] = [
  { bp: '2001', shortName: 'HSBC Bank' },
  { bp: '2002', shortName: 'Citi Bank N.A.' },
  { bp: '2003', shortName: 'Standard Chartered Bank' },
  { bp: '2004', shortName: 'JPMorgan Chase Bank' },
  { bp: '2005', shortName: 'Deutsche Bank AG' },
]

export const TXN_TYPE_MASTER: readonly { code: string; text: string }[] = [
  { code: 'SPOT', text: 'Spot' },
  { code: 'TOM', text: 'Tom' },
  { code: 'CASH', text: 'Cash' },
  { code: 'FWD', text: 'Forward' },
]

function leg(
  rfha: string,
  bukrs: string,
  butxt: string,
  sfhaart: string,
  dblfz: string,
  delfz: string,
  cpair: string,
  bs1: string,
  curr1: string,
  amt1: number,
  bs2: string,
  curr2: string,
  amt2: number,
  rate: number,
  kontrh: string,
  bpName: string,
  txnDesc: string,
  dealType: string,
  zroll: string,
  pm: boolean,
  unw: boolean,
): Leg {
  return {
    rfha,
    bukrs,
    butxt,
    sfhaart,
    dblfz,
    delfz,
    cpair,
    bs1,
    curr1,
    amt1,
    bs2,
    curr2,
    amt2,
    otot_rate: rate,
    kontrh,
    bpName,
    txnDesc,
    dealType,
    zuonr: rfha,
    zroll,
    ztsf_pre_mature: pm,
    ztsf_unwind: unw,
  }
}

// prettier-ignore
export const DEAL_DIRECTORY: Readonly<Record<string, readonly Leg[]>> = {
  TSF10045: [
    leg('1000004521','IN11','Olam Agri India Pvt Ltd','619','2026-08-01','2027-02-01','USD-INR','Buy','USD',1000000,'Sell','INR',89650000,89.65,'2001','HSBC Bank','Active','00','',false,false),
    leg('1000004522','IN11','Olam Agri India Pvt Ltd','605','2026-08-01','2026-08-05','USD-INR','Sell','USD',250000,'Buy','INR',22400000,89.60,'2002','Citi Bank N.A.','Confirmed','00','',false,false),
  ],
  TSF10078: [
    leg('1000004610','TH10','Olam (Thailand) Ltd','619','2026-06-15','2026-12-15','USD-INR','Buy','USD',2000000,'Sell','INR',179400000,89.70,'2003','Standard Chartered Bank','Active','00','',false,false),
    leg('1000004611','TH10','Olam (Thailand) Ltd','619','2026-12-15','2027-06-15','USD-INR','Buy','USD',2000000,'Sell','INR',180200000,90.10,'2003','Standard Chartered Bank','Rolled Over','01','R1-D1',false,false),
    leg('1000004609','TH10','Olam (Thailand) Ltd','619','2026-01-15','2026-06-15','USD-INR','Buy','USD',2000000,'Sell','INR',178100000,89.05,'2003','Standard Chartered Bank','Pre-Matured','00','',true,false),
  ],
  TSF10112: [
    leg('1000004780','VN10','Olam Vietnam Limited','631','2026-09-01','2027-03-01','EUR-USD','Buy','EUR',500000,'Sell','USD',542500,1.0850,'2004','JPMorgan Chase Bank','Confirmed','00','',false,false),
    leg('1000004781','VN10','Olam Vietnam Limited','608','2026-09-25','2026-09-27','EUR-USD','Sell','EUR',120000,'Buy','USD',130200,1.0850,'2005','Deutsche Bank AG','Unwound','00','',false,true),
  ],
}

/*
 * Deterministic PRNG seeded from the Deal ID string, so an arbitrary/unseen Deal ID still
 * produces stable, realistic legs instead of "no data". Kept operation-for-operation
 * identical to the legacy page so the same Deal ID yields the same legs.
 */
export function seedFromString(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const pick = <T,>(list: readonly T[], r: number): T => list[Math.floor(r * list.length)] as T

export function genDealLegs(dealId: string): Leg[] {
  const rnd = seedFromString(dealId.toUpperCase())
  const entities: readonly [string, string][] = [
    ['IN11', 'Olam Agri India Pvt Ltd'],
    ['TH10', 'Olam (Thailand) Ltd'],
    ['VN10', 'Olam Vietnam Limited'],
    ['AE13', 'Olam International DMCC'],
  ]
  const pairs: readonly [string, string, number][] = [
    ['USD', 'INR', 89.6],
    ['USD', 'AED', 3.6725],
    ['EUR', 'USD', 1.085],
    ['USD', 'SGD', 1.34],
    ['USD', 'JPY', 151.2],
  ]
  const types = ['619', '605', '607', '608']
  const ent = pick(entities, rnd())
  const pair = pick(pairs, rnd())
  const legCount = 1 + Math.floor(rnd() * 3)
  const legs: Leg[] = []
  const baseTrade = new Date(2026, Math.floor(rnd() * 9), 1 + Math.floor(rnd() * 27))
  for (let i = 0; i < legCount; i++) {
    const sfhaart = i === 0 ? '619' : pick(types, rnd())
    const bp = pick(BP_MASTER, rnd())
    const amt1 = Math.round((250000 + rnd() * 2500000) / 1000) * 1000
    const rateJit = pair[2] * (0.985 + rnd() * 0.03)
    const tdate = new Date(baseTrade.getTime() + i * 20 * 86400000)
    const vdate = new Date(tdate.getTime() + (30 + Math.floor(rnd() * 150)) * 86400000)
    const buySell = rnd() > 0.5
    legs.push(
      leg(
        `10000${(5000 + Math.floor(rnd() * 4999)).toString()}`,
        ent[0],
        ent[1],
        sfhaart,
        tdate.toISOString().slice(0, 10),
        vdate.toISOString().slice(0, 10),
        `${pair[0]}-${pair[1]}`,
        buySell ? 'Buy' : 'Sell',
        pair[0],
        amt1,
        buySell ? 'Sell' : 'Buy',
        pair[1],
        Math.round(amt1 * rateJit),
        Number(rateJit.toFixed(4)),
        bp.bp,
        bp.shortName,
        i === 0 ? 'Active' : 'Confirmed',
        '00',
        '',
        false,
        false,
      ),
    )
  }
  return legs
}
