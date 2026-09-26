/**
 * Reference and sample data, verbatim from the legacy page's "REFERENCE DATA" and "SAMPLE DEAL
 * IDS" blocks. The page never called an API: the reference lists mirror ZSGTSFTR_RULE_BT (FX
 * Models), ZSGTSFTR_ENT_STR (Entity Strings), ZSGTSFTR_CUR_STR (Currency Strings) and
 * ZSGTSFTR_COMP (TSF entities / company codes) as the SAP value-help screens show them.
 */
import { addDays } from './format.ts'
import type { AltTxn, Company, DealStatus, FxModel, RawDeal } from './types.ts'

export const COMPANIES: Record<string, Company> = {
  OGA: { name: 'Olam Global Agri Pte. Ltd.', co: 'SG03' },
  DMCC: { name: 'Olam International DMCC', co: 'AE13' },
  OSIPL: { name: 'Olam Agri India Pvt Ltd', co: 'IN11' },
  OTL: { name: 'Olam (Thailand) Ltd', co: 'TH10' },
  OVL: { name: 'Olam Vietnam Limited', co: 'VN10' },
  SEDA: { name: 'SEDA Outspan Iberia S.L.U', co: 'ES12' },
  PAN: { name: 'Panasia International FZE', co: 'AE11' },
  OSL: { name: 'Olam Shanghai Limited', co: 'CN10' },
  OAL: { name: 'Olam Global Agri Americas', co: 'US40' },
}

export const ENTITY_STRINGS: Record<string, string[]> = {
  E014: ['OGA', 'OSIPL', 'DMCC'],
  E015: ['OGA', 'DMCC', 'OSIPL'],
  E026: ['OGA', 'OSIPL', 'DMCC'],
  E033: ['OGA', 'DMCC', 'OTL'],
}

export const CURR_STRINGS: Record<string, string[]> = {
  C001: ['INR', 'INR', 'INR'],
  C002: ['USD', 'USD', 'INR'],
  C003: ['INR', 'INR', 'USD'],
  C012: ['USD', 'INR', 'INR'],
  C013: ['INR', 'USD', 'USD'],
}

/** The original wrote "&amp;" here because it rendered through innerHTML; React escapes, so plain "&". */
export const FX_MODELS: Record<string, FxModel> = {
  M032: { desc: 'INR Long Forward', subType: 'FX1', entityId: 'E015', currId: 'C002' },
  M033: { desc: 'INR-INR-INR Forward', subType: 'FX1', entityId: 'E015', currId: 'C001' },
  M034: { desc: 'INR – INR Staggered Call & Put Option', subType: 'FX2', entityId: 'E015', currId: 'C003' },
  M035: { desc: 'INR-INR-Put & Call Option', subType: 'FX2', entityId: 'E014', currId: 'C003' },
  M036: { desc: 'USD-INR-INR-Put & Call Option', subType: 'FX2', entityId: 'E015', currId: 'C012' },
  M037: { desc: 'INR Short Forward', subType: 'FX1', entityId: 'E015', currId: 'C013' },
  M041: { desc: 'INR – INR Staggered Call & Put Option', subType: 'FX2', entityId: 'E026', currId: 'C001' },
}

export const STATUS_DESC: Record<DealStatus, string> = {
  '01': 'Not Confirmed',
  '02': 'Confirmed by MO',
  '03': 'In Use',
  '30': 'Cancelled',
}

export const PARTNER_BANK = '0660012173 — JPMORGAN CHASE BANK NA SINGAPORE'

/** Share of notional baked in on the middle (DMCC) invoice legs: the parked trade markup. */
export const MARKUP_PCT = 0.002

/** Edit Deal Pair's matching open transactions, per leg (ABAP screen 9004). */
export const EP_ALT_TXNS: Record<'D1' | 'D2', AltTxn[]> = {
  D1: [
    { rfha: '0500011234', desc: 'Alt Forward booked 2 days earlier, same amount' },
    { rfha: '0500011291', desc: 'Alt Forward booked same day, partner: HSBC Singapore' },
  ],
  D2: [
    { rfha: '0500011455', desc: 'Alt Option booked same day, same strike' },
    { rfha: '0500011488', desc: 'Alt Option booked same day, DBS Bank Ltd' },
  ],
}

type DealSeed = Omit<RawDeal, 'dealStart' | 'dealEnd' | 'shipStart' | 'shipEnd'> & {
  /** Day offsets from today: deal start / end, ship start / end. */
  days: [number, number, number, number]
}

const DEAL_SEED: DealSeed[] = [
  { dealId: '1100000564', mcRef: '2000000184', model: 'M041', trader: 'D_OSIPL', status: '01', days: [-40, 220, 30, 240], origin: 'OSIPL', allInRate: 88.475, notional: 20000000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000565', mcRef: '2000002727', model: 'M032', trader: 'T_ADRIEL', status: '02', days: [-95, 10, -20, 15], origin: 'OSIPL', allInRate: 90.7112, notional: 5000000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000566', mcRef: '2000002728', model: 'M032', trader: 'T_HARSHADA', status: '03', days: [-150, -3, -60, -2], origin: 'OSIPL', allInRate: 95.7112, notional: 100000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000567', mcRef: '2000002723', model: 'M034', trader: 'K_RAMASAMY', status: '01', days: [-12, 300, 45, 310], origin: 'OSIPL', allInRate: 87, notional: 7391000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000568', mcRef: '2000002717', model: 'M032', trader: 'D_OSIPL', status: '02', days: [-70, 40, -10, 45], origin: 'OSIPL', allInRate: 89.5, notional: 30087000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000569', mcRef: '2000002713', model: 'M041', trader: 'S_KHANVILKAR', status: '01', days: [-5, 260, 55, 280], origin: 'OSIPL', allInRate: 88.9, notional: 48524000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000570', mcRef: '2000002710', model: 'M037', trader: 'A_KAMATH', status: '02', days: [-30, 70, 5, 80], origin: 'OSIPL', allInRate: 83.2, notional: 18335000, curr1: 'INR', curr2: 'USD' },
  { dealId: '1100000571', mcRef: '2000002708', model: 'M032', trader: 'K_RAMASAMY', status: '30', days: [-200, -40, -120, -35], origin: 'OSIPL', allInRate: 91.2, notional: 28838000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000572', mcRef: '2000002702', model: 'M036', trader: 'D_OSIPL', status: '01', days: [-2, 180, 20, 190], origin: 'OSIPL', allInRate: 1, notional: 12450000, curr1: 'USD', curr2: 'INR' },
  { dealId: '1100000573', mcRef: '2000002719', model: 'M034', trader: 'S_KHANVILKAR', status: '03', days: [-260, -80, -200, -75], origin: 'OSIPL', allInRate: 86.3, notional: 16763000, curr1: 'USD', curr2: 'INR' },
]

/** The sample Deal IDs, dated relative to `today` as the original's mkDate(offset) did. */
export function rawDeals(today: Date): RawDeal[] {
  return DEAL_SEED.map(({ days, ...r }) => ({
    ...r,
    dealStart: addDays(today, days[0]),
    dealEnd: addDays(today, days[1]),
    shipStart: addDays(today, days[2]),
    shipEnd: addDays(today, days[3]),
  }))
}
