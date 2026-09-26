/**
 * Master / reference data of the DE6 FX Blotter, copied from legacy/fx-deal-blotter.html.
 * The original is a standalone demo that never called SAP, so all of it is dummy data.
 */
import type {
  BusinessPartner,
  CodeDesc,
  CodeLabel,
  CurrencyPair,
  Entity,
  FixingReference,
  FxModel,
  Group,
  McSeed,
  Portfolio,
  Trader,
  TransactionType,
} from './types.ts'

export const TRADERS: Trader[] = [
  { code: 'NID', name: 'Nidhi S', group: 'G02', teamLead: false },
  { code: 'APA', name: 'Aparna', group: 'G02', teamLead: false },
  { code: 'LAK', name: 'Lakshmi', group: 'G02', teamLead: false },
  { code: 'SIB', name: 'Sibte', group: 'G02', teamLead: false },
  { code: 'RAK', name: 'Rahul K', group: 'G02', teamLead: false },
  { code: 'AME', name: 'Amey T', group: 'G02', teamLead: false },
  { code: 'ANI', name: 'Anil Jena', group: 'G02', teamLead: false },
  { code: 'MAY', name: 'Mayank Jain', group: 'G02', teamLead: false },
  { code: 'TER', name: 'TERRY TAY', group: 'G03', teamLead: true },
  { code: 'RAY', name: 'Rahul Yadav', group: 'G03', teamLead: false },
  { code: 'SUN', name: 'SUN BIN', group: 'G03', teamLead: false },
  { code: 'AND', name: 'Andre', group: 'G04', teamLead: false },
  { code: 'SUJ', name: 'Sujaya S', group: 'G04', teamLead: false },
  { code: 'PRE', name: 'Prem Sai', group: 'G07', teamLead: false },
]

export const GROUPS: Group[] = [
  { code: 'G02', desc: 'TSF - India' },
  { code: 'G03', desc: 'TSF - SEA' },
  { code: 'G04', desc: 'TSF - MEA' },
  { code: 'G07', desc: 'TSF - Brazil' },
]

export const ENTITIES: Entity[] = [
  { code: 'OGA', cocode: 'SG03', name: 'Olam Global Agri Pte. Ltd', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'SINGAPORE' },
  { code: 'OGAT', cocode: 'SG39', name: 'Olam Global Agri Treasury', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'SINGAPORE' },
  { code: 'DMCC', cocode: 'AE13', name: 'Olam International DMCC', currency: 'USD', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM INTERNATIONAL DMCC' },
  { code: 'OSIPL', cocode: 'IN11', name: 'Olam Agri India Pvt Ltd', currency: 'INR', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM AGRI INDIA PRIVATE LIMITED' },
  { code: 'OTL', cocode: 'TH10', name: 'Olam (Thailand) Ltd', currency: 'THB', defaultProfitCenter: 'FX', businessArea: 'OLAM (THAILAND) LIMITED' },
  { code: 'OVL', cocode: 'VN10', name: 'Olam Vietnam Limited', currency: 'VND', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM VIETNAM LIMITED' },
  { code: 'OAL', cocode: 'US40', name: 'Olam Global Agri Americas', currency: 'USD', defaultProfitCenter: 'FX', businessArea: 'OLAM GLOBAL AGRI AMERICAS LLC' },
  { code: 'SEDA', cocode: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U', currency: 'EUR', defaultProfitCenter: 'TSF-FX', businessArea: 'PANASIA INTERNATIONAL FZCO' },
]

/** The starting list; Upload appends partners it cannot match, so the page keeps its own copy. */
export const BUSINESS_PARTNERS: BusinessPartner[] = [
  { code: 'BP1001', short: 'DBS SG', name: 'DBS Bank Ltd', group: 'G03' },
  { code: 'BP1002', short: 'SCB SG', name: 'Standard Chartered Bank', group: 'G03' },
  { code: 'BP1003', short: 'JPM IN', name: 'JPMorgan Chase Bank', group: 'G02' },
  { code: 'BP1004', short: 'CITI SG', name: 'Citibank N.A.', group: 'G03' },
  { code: 'BP1007', short: 'RABO SG', name: 'Rabobank', group: 'G03' },
  { code: 'BP1005', short: 'Internal', name: 'Internal Group Entity', group: 'ALL' },
  { code: 'BP1006', short: 'Internal', name: 'Internal Group Entity', group: 'ALL' },
]

export const TRANSACTION_TYPES: TransactionType[] = [
  { code: 'SPOT', desc: 'Spot', sapType: '620', valueDateOffset: 2, ndf: false },
  { code: 'TOM', desc: 'Tomorrow (TOM)', sapType: '621', valueDateOffset: 1, ndf: false },
  { code: 'FWD', desc: 'Outright Forward', sapType: '625', valueDateOffset: 30, ndf: false },
  { code: 'NDF', desc: 'Non-Deliverable Fwd', sapType: '632', valueDateOffset: 30, ndf: true },
  { code: 'DNDF', desc: 'Deliverable NDF', sapType: '632', valueDateOffset: 30, ndf: true },
  { code: 'SWAP', desc: 'FX Swap', sapType: '640', valueDateOffset: 30, ndf: false },
]

export const CURRENCY_PAIRS: CurrencyPair[] = [
  { pair: 'USD/INR', lead: 'USD', follow: 'INR', quotePer: 1, baseRate: 83.2 },
  { pair: 'USD/IDR', lead: 'USD', follow: 'IDR', quotePer: 100, baseRate: 1580.0 },
  { pair: 'USD/VND', lead: 'USD', follow: 'VND', quotePer: 100, baseRate: 2530.0 },
  { pair: 'USD/TWD', lead: 'USD', follow: 'TWD', quotePer: 100, baseRate: 3210.0 },
  { pair: 'USD/KWA', lead: 'USD', follow: 'KWA', quotePer: 100, baseRate: 3.05 },
  { pair: 'USD/THB', lead: 'USD', follow: 'THB', quotePer: 1, baseRate: 35.1 },
  { pair: 'USD/EUR', lead: 'USD', follow: 'EUR', quotePer: 1, baseRate: 0.92 },
  { pair: 'USD/USD', lead: 'USD', follow: 'USD', quotePer: 1, baseRate: 1.0 },
]

export const PORTFOLIOS: Portfolio[] = [{ code: 'TRADING', desc: 'Trading', group: 'ALL' }]

export const ASSIGNMENTS: CodeDesc[] = [
  { code: '360T', desc: '360T' },
  { code: 'BARX', desc: 'BARX' },
  { code: 'EMAIL', desc: 'Email / Phone' },
  { code: 'FXALL', desc: 'FXALL' },
  { code: 'JPMC', desc: 'JPMC' },
  { code: 'PLUTO', desc: 'Pluto' },
]

export const PROFIT_CENTERS: CodeLabel[] = [
  { code: 'TSF-FX', label: 'TSF-FX' },
  { code: 'TSF - FX', label: 'TSF - FX' },
  { code: 'FX', label: 'FX' },
]

export const BUSINESS_AREAS: CodeLabel[] = [
  { code: 'OLAM AGRI INDIA PRIVATE LIMITED', label: 'OLAM AGRI INDIA PRIVATE LIMITED' },
  { code: 'OLAM VIETNAM LIMITED', label: 'OLAM VIETNAM LIMITED' },
  { code: 'OLAM (THAILAND) LIMITED', label: 'OLAM (THAILAND) LIMITED' },
  { code: 'PANASIA INTERNATIONAL FZCO', label: 'PANASIA INTERNATIONAL FZCO' },
  { code: 'OLAM INTERNATIONAL DMCC', label: 'OLAM INTERNATIONAL DMCC' },
  { code: 'OLAM GLOBAL AGRI AMERICAS LLC', label: 'OLAM GLOBAL AGRI AMERICAS LLC' },
  { code: 'SINGAPORE', label: 'SINGAPORE' },
  { code: 'OLAM OUTSPAN TSF', label: 'Olam Outspan TSF' },
  { code: 'HCMC HEAD OFFICE', label: 'HCMC Head Office' },
  { code: 'KAMOLKHI - THAILAND', label: 'Kamolkhi - Thailand' },
]

export const FIXING_REFERENCES: FixingReference[] = [
  { code: 'FBIL', pair: 'USD/INR' },
  { code: 'ABS/BBSW', pair: 'USD/VND' },
  { code: 'TAIFX', pair: 'USD/TWD' },
  { code: 'JISDOR', pair: 'USD/IDR' },
]

/** Static factory-calendar holidays (illustrative, not exhaustive), as YYYY-MM-DD. */
export const HOLIDAYS = ['2026-01-01', '2026-01-26', '2026-03-25', '2026-08-15', '2026-10-02', '2026-12-25']

/** Tolerances default to 5% and 5 days where the original's model list left them out. */
export const FX_MODELS: FxModel[] = [
  { code: 'M017', desc: 'USD Long Forward', entities: ['OAL', 'DMCC', 'OTL'], pair: 'USD/THB', d1: { from: 'OAL', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 35, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M021', desc: 'INR Long Forward', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 28, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M025', desc: 'EUR Long Forward', entities: ['SEDA', 'DMCC', 'OVL'], pair: 'USD/EUR', d1: { from: 'SEDA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OVL', bs1: 'S', bs2: 'B' }, spreadBp: 22, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M032', desc: 'INR Long Forward (Alt)', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 30, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M034', desc: 'INR-INR Staggered Option', entities: ['OGA', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 40, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M041', desc: 'INR Short Forward', entities: ['OGAT', 'DMCC', 'OSIPL'], pair: 'USD/INR', d1: { from: 'OGAT', to: 'DMCC', bs1: 'B', bs2: 'S' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'B', bs2: 'S' }, spreadBp: 25, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M052', desc: 'VND Long Forward', entities: ['OGA', 'DMCC', 'OVL'], pair: 'USD/VND', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OVL', bs1: 'S', bs2: 'B' }, spreadBp: 45, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M061', desc: 'IDR Long Forward', entities: ['OGA', 'DMCC', 'OTL'], pair: 'USD/IDR', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 50, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M070', desc: 'TWD Short Straddle', entities: ['OGA', 'DMCC', 'OTL'], pair: 'USD/TWD', d1: { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OTL', bs1: 'S', bs2: 'B' }, spreadBp: 38, ssEligible: true, tolerancePct: 5, valueDateToleranceDays: 5 },
  { code: 'M081', desc: 'THB Long Forward', entities: ['OAL', 'DMCC', 'OSIPL'], pair: 'USD/THB', d1: { from: 'OAL', to: 'DMCC', bs1: 'S', bs2: 'B' }, d2: { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' }, spreadBp: 33, tolerancePct: 5, valueDateToleranceDays: 5 },
]

export const COMMODITIES: CodeDesc[] = [
  { code: 'C110', desc: 'Soyabean Oil' },
  { code: 'C102', desc: 'Wheat' },
  { code: 'C125', desc: 'Rice' },
  { code: 'C140', desc: 'Sugar' },
]

/** Seed Master Contracts; ship dates are offsets in days from the day the page opens. */
export const MC_SEED: McSeed[] = [
  { n: 'MC-7001', model: 'M021', comm: 'C110', desc: '5,000 MT Soyabean Oil - OSIPL', amtUSD: 5000000, shipStartOff: 20, shipDur: 90, group: 'G02' },
  { n: 'MC-7014', model: 'M017', comm: 'C102', desc: 'Wheat Financing - OTL', amtUSD: 8000000, shipStartOff: 15, shipDur: 60, group: 'G03' },
  { n: 'MC-7028', model: 'M052', comm: 'C125', desc: 'Rice Financing - OVL', amtUSD: 3000000, shipStartOff: 10, shipDur: 75, group: 'G03' },
  { n: 'MC-7033', model: 'M025', comm: 'C140', desc: 'Sugar Financing - OVL(EUR)', amtUSD: 4500000, shipStartOff: 25, shipDur: 100, group: 'G03' },
  { n: 'MC-7041', model: 'M041', comm: 'C110', desc: 'Soyabean Oil Short Fwd - OSIPL', amtUSD: 2500000, shipStartOff: 5, shipDur: 45, group: 'G02' },
  { n: 'MC-7052', model: 'M070', comm: 'C102', desc: 'TWD Straddle - OTL', amtUSD: 6000000, shipStartOff: 12, shipDur: 80, group: 'G03' },
]

/** The counters' starting values, which Refresh (hard reset) returns to. */
export const INITIAL_COUNTERS = { rfha: 8100001, dealId: 9080, ssDealId: 500, draft: 1, seq: 1 } as const

export const modelOf = (code: string): FxModel | null => FX_MODELS.find((m) => m.code === code) ?? null
export const entityOf = (code: string): Entity | null => ENTITIES.find((e) => e.code === code) ?? null
export const pairOf = (code: string): CurrencyPair | null => CURRENCY_PAIRS.find((p) => p.pair === code) ?? null
export const txnTypeOf = (code: string): TransactionType | null => TRANSACTION_TYPES.find((t) => t.code === code) ?? null
export const partnerOf = (partners: BusinessPartner[], code: string): BusinessPartner | undefined =>
  partners.find((b) => b.code === code)
