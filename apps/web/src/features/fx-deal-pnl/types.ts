/**
 * FX Deal P&L Analysis: the data model. A parent Deal ID has linked FX legs (D1, D2 ...), the entities that book them, an
 * optional maturity (fixing) step and the settlement flows per entity. Everything the report shows is derived from these
 * raw facts by calc.ts, nothing is stored as a result.
 *
 * Signs follow cash: a positive amount is received, a negative one is paid.
 */

export type DealStatus = 'Open' | 'Matured' | 'Settled'
export type Direction = 'Buy USD' | 'Sell USD'

/** A booking entity: code like "OIL-USD", its company code, and the currency it reports in. */
export type Entity = { code: string; company: string; ccy: string }

/** One linked FX transaction of a Deal ID. `usd` and `local` have opposite signs. */
export type Leg = {
  /** D1, D2: the leg's role in the Deal ID, not necessarily an SAP deal number. */
  ref: string
  label: string
  type: string
  entity: string
  direction: Direction
  usd: number
  local: number
  localCcy: string
  /** Counter currency per USD at which the leg was dealt. */
  rate: number
  tradeDate: string
  maturityDate: string
}

/** The rate a leg was fixed at on maturity. */
export type Fixing = { legRef: string; rate: number; date: string }

/** What an entity paid and received when the deal settled, in the entity's currency. */
export type Flow = { entity: string; payRef: string; receiveRef: string; pay: number; receive: number; note: string }

export type DealDetail = {
  id: string
  /** The FX model code (M032 ...), and in `type` its description. */
  model: string
  description: string
  type: string
  pair: string
  localCcy: string
  status: DealStatus
  tradeDate: string
  maturityDate: string
  entities: Entity[]
  legs: Leg[]
  fixings: Fixing[]
  flows: Flow[]
  /** The entity that books the planned (arbitrage) P&L. */
  plannedEntity: string
  /** Counter-currency units per USD used to express non-USD amounts in the reporting currency. */
  reportingRate: number
  settlementDate: string | null
}

export const REPORTING_CCY = 'USD'

// ---------------------------------------------------------------- results (what the API serves)

export type MaturityRow = {
  legRef: string
  label: string
  type: string
  entity: string
  usd: number | null
  local: number | null
  fixingRate: number | null
  realised: number | null
  date: string | null
}

export type EntityPnl = {
  entity: string
  company: string
  ccy: string
  /** Units of `ccy` per USD (1 for a USD entity). */
  rate: number
  planned: number | null
  plannedUsd: number | null
  settlement: number | null
  settlementUsd: number | null
  actualUsd: number | null
  netUsd: number | null
}

export type NetBasis = 'actual' | 'planned' | 'none'

export type DealPnl = {
  dealId: string
  entities: EntityPnl[]
  consolidatedNetUsd: number
  basis: NetBasis
  reportingCcy: string
  reportingRate: number
  localCcy: string
}

export type DealSummary = {
  id: string
  model: string
  description: string
  type: string
  entities: string[]
  pair: string
  localCcy: string
  status: DealStatus
  tradeDate: string
  maturityDate: string
  plannedUsd: number | null
  settlementUsd: number | null
  actualUsd: number | null
  netUsd: number | null
  basis: NetBasis
}

export type PlannedCalc = {
  dealId: string
  legs: Leg[]
  localCcy: string
  receivedLocal: number
  paidLocal: number
  arbitrageLocal: number
  reportingRate: number
  arbitrageUsd: number
  rateSpread: number
  plannedEntity: string
}

export type SettlementEntity = {
  entity: string
  company: string
  ccy: string
  rate: number
  pay: number
  receive: number
  net: number
  netUsd: number
  payRef: string
  receiveRef: string
  note: string
}

export type SettlementCalc = {
  dealId: string
  maturity: MaturityRow[]
  realisedTotal: number
  flows: SettlementEntity[]
  settlementDate: string | null
  reportingRate: number
  localCcy: string
}
