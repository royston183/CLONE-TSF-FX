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
  Portfolio,
  SpotTxnType,
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

/** Filled from the middleware (comp) before the screen opens; see masters.ts. */
export const ENTITIES: Entity[] = []

/** The starting list; Upload appends partners it cannot match, so the page keeps its own copy. */
export const BUSINESS_PARTNERS: BusinessPartner[] = [
  { code: 'BP1001', short: 'DBS SG', name: 'DBS Bank Ltd', group: 'G03' },
  { code: 'BP1002', short: 'SCB SG', name: 'Standard Chartered Bank', group: 'G03' },
  { code: 'BP1003', short: 'JPM IN', name: 'JPMorgan Chase Bank', group: 'G02' },
  { code: 'BP1004', short: 'CITI SG', name: 'Citibank N.A.', group: 'G03' },
  { code: 'BP1007', short: 'RABO SG', name: 'Rabobank', group: 'G03' },
  // A real SAP partner: Create Transaction sends the code as Partner, so only SAP numbers work there.
  { code: '400000002', short: '400000002', name: '400000002', group: 'G03' },
  { code: 'BP1005', short: 'Internal', name: 'Internal Group Entity', group: 'ALL' },
  { code: 'BP1006', short: 'Internal', name: 'Internal Group Entity', group: 'ALL' },
]

/**
 * Each blotter type with the SAP product type / transaction type it books as (see SPOT_TXN_TYPES).
 * SWAP has no counterpart in that value help, so it has none and cannot be created in SAP.
 */
export const TRANSACTION_TYPES: TransactionType[] = [
  { code: 'SPOT', desc: 'Spot', product: '12A', sapType: '609', valueDateOffset: 2, ndf: false },
  { code: 'TOM', desc: 'Tomorrow (TOM)', product: '12A', sapType: '602', valueDateOffset: 1, ndf: false },
  { code: 'FWD', desc: 'Outright Forward', product: '12B', sapType: '619', valueDateOffset: 30, ndf: false },
  { code: 'NDF', desc: 'Non-Deliverable Fwd', product: '12D', sapType: '631', valueDateOffset: 30, ndf: true },
  { code: 'DNDF', desc: 'Deliverable NDF', product: '12D', sapType: '632', valueDateOffset: 30, ndf: true },
  { code: 'SWAP', desc: 'FX Swap', product: '', sapType: '', valueDateOffset: 30, ndf: false },
]

/** The Create Spot popup books only these company codes, and this one partner. */
export const SPOT_COMPANY_CODES: readonly string[] = ['SG03', 'AE13']
export const SPOT_PARTNER_CODE = '400000002'

/**
 * The Create Spot popup's Transaction Type list, copied from the SAP value help (product type,
 * transaction type, name). Names are as the value help printed them, including the three it cut
 * off at its column width ("Exercis" twice, "Settlement S").
 */
export const SPOT_TXN_TYPES: SpotTxnType[] = [
  { product: '12A', code: '600', desc: 'FX Spot: External-Spot' },
  { product: '12A', code: '601', desc: 'FX Spot: External-Cash' },
  { product: '12A', code: '602', desc: 'FX Spot: External-TOM' },
  { product: '12A', code: '603', desc: 'FX Spot: External-Spot-Exercis' },
  { product: '12A', code: '604', desc: 'FX Spot: External-Spot-Exercis' },
  { product: '12A', code: '605', desc: 'FX Spot: External-Spot - TSF' },
  { product: '12A', code: '607', desc: 'FX Spot: External-Cash - TSF' },
  { product: '12A', code: '609', desc: 'FX Spot: External-Settlement S' },
  { product: '12B', code: '619', desc: 'FX Forwards: External-Forward' },
  { product: '12D', code: '631', desc: 'FX NDF: External-NDF - TSF' },
  { product: '12D', code: '632', desc: 'FX NDF: External-DNDF - TSF' },
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

/** Filled from the middleware (comp, the FX profit centre name) before the screen opens; see masters.ts. */
export const PROFIT_CENTERS: CodeLabel[] = []

/** Filled from the middleware (comp, the business area columns) before the screen opens; see masters.ts. */
export const BUSINESS_AREAS: CodeLabel[] = []

/** Filled from the middleware (ftrtFixDef, the fixing references) before the screen opens; see masters.ts. */
export const FIXING_REFERENCES: FixingReference[] = []

/** Static factory-calendar holidays (illustrative, not exhaustive), as YYYY-MM-DD. */
export const HOLIDAYS = ['2026-01-01', '2026-01-26', '2026-03-25', '2026-08-15', '2026-10-02', '2026-12-25']

/** Filled from the middleware (fxModel) before the screen opens; see masters.ts. */
export const FX_MODELS: FxModel[] = []

/** Filled from the middleware (commodity) before the screen opens; see masters.ts. */
export const COMMODITIES: CodeDesc[] = []

// The Master Contracts are not constants: they are read from the middleware (masterContract) and
// handed to the screen by the loader in masters.ts.

/** The counters' starting values, which Refresh (hard reset) returns to. */
export const INITIAL_COUNTERS = { rfha: 8100001, dealId: 9080, ssDealId: 500, draft: 1, seq: 1 } as const

export const modelOf = (code: string): FxModel | null => FX_MODELS.find((m) => m.code === code) ?? null
export const entityOf = (code: string): Entity | null => ENTITIES.find((e) => e.code === code) ?? null
export const pairOf = (code: string): CurrencyPair | null => CURRENCY_PAIRS.find((p) => p.pair === code) ?? null
export const txnTypeOf = (code: string): TransactionType | null => TRANSACTION_TYPES.find((t) => t.code === code) ?? null
export const partnerOf = (partners: BusinessPartner[], code: string): BusinessPartner | undefined =>
  partners.find((b) => b.code === code)
