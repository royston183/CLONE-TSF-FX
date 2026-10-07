/**
 * Seed data, verbatim from the legacy page's "MASTER / REFERENCE DATA" and "SEED DATA" blocks.
 * The page never called an API: every list here stands in for an SAP table the ABAP report
 * ZSGTSFR102 reads (regions, entities, the Short Straddle FX Model master, the MC and Deal ID
 * tables), and is kept in this one file so swapping it for OData later touches nothing else.
 *
 * api.ts now swaps ENTITIES, FX_MODELS, COMMODITIES and PAYMENT_TERMS in place for their
 * MySQL rows (each list stays as below when MySQL has none) and overwrites STATUS_MASTER's
 * texts where ZSGTSFTR_MC_STAT has them. REGIONS is replaced by the SAP region codes (shared/fx/regions.ts); PORT_PAIRS stays dummy. The MC and Deal
 * ID seeds below only appear when the middleware cannot be reached.
 */
import type { Commodity, DealStatus, Entity, FxModel, McSeed, McStatus, PaymentTerm, PortPair, Region } from './types.ts'

export const REGIONS: Region[] = [
  { id: 'R01', name: 'South-East Asia' },
  { id: 'R02', name: 'China' },
  { id: 'R03', name: 'United States of America' },
  { id: 'R04', name: 'Middle East & Africa' },
  { id: 'R05', name: 'Europe' },
  { id: 'R07', name: 'Latin America' },
]

export const ENTITIES: Entity[] = [
  { code: 'DMCC', name: 'Olam International DMCC', region: 'R04' },
  { code: 'OAL', name: 'Olam Global Agri Americas', region: 'R03' },
  { code: 'OGA', name: 'Olam Global Agri Pte. Ltd', region: 'R01' },
  { code: 'OSIPL', name: 'Olam Agri India Pvt Ltd', region: 'R01' },
  { code: 'OTL', name: 'Olam (Thailand) Ltd', region: 'R01' },
  { code: 'OVL', name: 'Olam Vietnam Limited', region: 'R01' },
  { code: 'SEDA', name: 'SEDA OUTSPAN IBERIA S.L.U', region: 'R05' },
]

/**
 * Only Short Straddle models (ZSS = 'X') are ever fetched by this report — the ABAP hard-codes
 * SELECT ... FROM zsgtsftr_rule_bt WHERE zss EQ abap_true.
 */
export const FX_MODELS: FxModel[] = [
  // dealType / subType: the FX / FX1 the page always booked its Deal IDs as.
  { code: 'M050', desc: 'INR Short Straddle', entities: ['OGA', 'DMCC', 'OSIPL'], curr: ['USD', 'USD', 'INR'], entityId: 'E040', currId: 'C002', origin: '', dealType: 'FX', subType: 'FX1' },
  { code: 'M051', desc: 'USD Short Straddle', entities: ['OAL', 'DMCC', 'OTL'], curr: ['USD', 'USD', 'USD'], entityId: 'E041', currId: 'C003', origin: '', dealType: 'FX', subType: 'FX1' },
  { code: 'M052', desc: 'EUR Short Straddle', entities: ['SEDA', 'DMCC', 'OVL'], curr: ['USD', 'USD', 'EUR'], entityId: 'E042', currId: 'C006', origin: '', dealType: 'FX', subType: 'FX1' },
]

/** The original pushed C001 onto this list after the seed block; it is simply listed last here. */
export const COMMODITIES: Commodity[] = [
  { code: 'C102', desc: 'WHEAT' },
  { code: 'C125', desc: 'RICE' },
  { code: 'C110', desc: 'SOYABEAN OIL' },
  { code: 'C140', desc: 'SUGAR' },
  { code: 'C001', desc: 'Multi-Commodity' },
]

export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'P01', desc: '30 days from B/L date' },
  { code: 'P05', desc: 'Advance payment' },
  { code: 'P07', desc: '60 days from B/L date' },
]

export const PORT_PAIRS: PortPair[] = [
  { ship: 'Any Port(s) in India or any other port(s)', dest: 'Any Port(s) in Middle East or any other port(s)' },
  { ship: 'Any Port(s) in Thailand or any other port(s)', dest: 'Any Port(s) in China or any other port(s)' },
  { ship: 'Any Port(s) in Vietnam or any other port(s)', dest: 'Any Port(s) in Europe or any other port(s)' },
]

export const STATUS_MASTER: Record<McStatus, string> = {
  '01': 'Created',
  '02': 'Release to MO',
  '03': 'Confirmed by MO',
  '04': 'Deal ID Created (In-Use)',
  '09': 'Expired',
  '21': 'Reversed by MO',
}
export const STATUS_CODES = Object.keys(STATUS_MASTER) as McStatus[]
export const STATUS_CLASS: Record<McStatus, string> = {
  '01': 'st-pending',
  '02': 'st-pending',
  '03': 'st-confirmed',
  '04': 'st-inuse',
  '09': 'st-rejected',
  '21': 'st-errcorr',
}
export const DEAL_STATUS_MASTER: Record<DealStatus, string> = { '01': 'Created', '10': 'Active', '30': 'Cancelled' }
export const DEAL_STATUS_CLASS: Record<DealStatus, string> = { '01': 'created', '10': 'active', '30': 'cancelled' }
/** ABAP excludes this: WHERE b~zdeal_stat <> c_30 */
export const CANCELLED_DEAL_STATUS: DealStatus = '30'

export const DOC_SOURCE = '\\\\tsffs01\\tsf_docs\\mc_contracts\\'
export const TRADER_NAME = 'SIDDHI PATEL'
export const TRADE_CODE = 'TRD-014'

/**
 * Last number drawn from number-range object ZSGTSFNR01 (interval 01) before the seed deals
 * are numbered; the first seed deal is therefore 0000009089.
 *
 * Dummy mode only. Against MySQL every Deal ID comes from the middleware's range
 * (ZSGTSFNR01/01, 10 digits) and this counter is never used.
 */
export const INITIAL_DEAL_SEQ = 9088

/**
 * The dummy masters as they were before api.ts swapped them, so the seed contracts are
 * always derived from the values they were written against.
 */
export const SEED_FX_MODELS: readonly FxModel[] = [...FX_MODELS]
export const SEED_COMMODITIES: readonly Commodity[] = [...COMMODITIES]
export const SEED_PAYMENT_TERMS: readonly PaymentTerm[] = [...PAYMENT_TERMS]

export const MC_SEED: McSeed[] = [
  { ref: 4500001001, model: 'M050', comm: 'C102', stat: '03', amt: 8000000, exRate: 83.15, mcDate: '01.09.2026', shipStartOff: 20, shipDur: 120, moNote: '', foNote: '', deals: [] },
  {
    ref: 4500001002, model: 'M050', comm: 'C110', stat: '04', amt: 5000000, exRate: 83.40, mcDate: '05.09.2026', shipStartOff: 25, shipDur: 90, moNote: '', foNote: 'Vessel nominated - MV Trade Wind',
    deals: [
      { stat: '10', amtUSD: 5000000, offsetDays: 2 },
      { stat: '30', amtUSD: 1500000, offsetDays: 3 },
    ],
  },
  { ref: 4500001003, model: 'M051', comm: 'C001', stat: '01', amt: 3000000, exRate: 1.0, mcDate: '20.09.2026', shipStartOff: 40, shipDur: 60, moNote: '', foNote: '', deals: [] },
  { ref: 4500001004, model: 'M051', comm: 'C125', stat: '02', amt: 2200000, exRate: 1.0, mcDate: '18.09.2026', shipStartOff: 35, shipDur: 75, moNote: '', foNote: '', deals: [] },
  {
    ref: 4500001005, model: 'M052', comm: 'C140', stat: '09', amt: 1800000, exRate: 0.92, mcDate: '05.08.2026', shipStartOff: 20, shipDur: 60, moNote: 'Shipment window lapsed without execution.', foNote: '',
    deals: [{ stat: '10', amtUSD: 900000, offsetDays: 4 }],
  },
  { ref: 4500001006, model: 'M052', comm: 'C140', stat: '21', amt: 2600000, exRate: 0.91, mcDate: '10.08.2026', shipStartOff: 15, shipDur: 100, moNote: 'Reversed - counterparty commodity contract cancelled by Front Office.', foNote: '', deals: [] },
  { ref: 4500001007, model: 'M050', comm: 'C110', stat: '03', amt: 5000000, exRate: 83.28, mcDate: '12.09.2026', shipStartOff: 30, shipDur: 90, moNote: '', foNote: '5,000 MT soyabean oil parcel', deals: [] },
  {
    ref: 4500001008, model: 'M051', comm: 'C125', stat: '04', amt: 9000000, exRate: 1.0, mcDate: '02.09.2026', shipStartOff: 18, shipDur: 150, moNote: '', foNote: '',
    deals: [
      { stat: '10', amtUSD: 3000000, offsetDays: 2 },
      { stat: '10', amtUSD: 3000000, offsetDays: 10 },
      { stat: '01', amtUSD: 2000000, offsetDays: 18 },
    ],
  },
]
