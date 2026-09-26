/** A TSF entity / company code (ZSGTSFTR_COMP). */
export type Company = { name: string; co: string }

/** An FX Model (ZSGTSFTR_RULE_BT). FX1 books forwards, FX2 options. */
export type FxModel = { desc: string; subType: 'FX1' | 'FX2'; entityId: string; currId: string }

/** ABAP Deal ID status codes. */
export type DealStatus = '01' | '02' | '03' | '30'

export type BuySell = 'Buy' | 'Sell'

/** One row of the legacy RAW_DEALS block, its dates already resolved against "today". */
export type RawDeal = {
  dealId: string
  mcRef: string
  model: string
  trader: string
  status: DealStatus
  dealStart: Date
  dealEnd: Date
  shipStart: Date
  shipEnd: Date
  origin: string
  allInRate: number
  notional: number
  curr1: string
  curr2: string
}

/** A market-facing FX Deal leg, D1 or D2. */
export type FxLeg = {
  leg: 'D1' | 'D2'
  coCode: string
  tradeDate: Date
  buy1: BuySell
  curr1: string
  amt1: number
  buy2: BuySell
  curr2: string
  amt2: number
  rate: number
  valueDate: Date
  partner: string
  txnType: string
}

/** A planned trade-invoice leg, T1 / T2 / T3 — one per step of the Entity String. */
export type InvLeg = {
  ref: string
  type: 'T1' | 'T2' | 'T3'
  dealType: 'D1' | 'D2'
  sell: string
  buy: string
  mcSell: string
  mcBuy: string
  amt: number
  rate: number
  invAmt: number
  curr: string
}

export type EditPairEntry = { leg: 'D1' | 'D2'; newRfha: string; at: Date }

export type Deal = {
  dealId: string
  mcRef: string
  model: string
  modelDesc: string
  subType: FxModel['subType']
  entityId: string
  entChain: string[]
  currId: string
  currChain: string[]
  trader: string
  status: DealStatus
  dealStart: Date
  dealEnd: Date
  shipStart: Date
  shipEnd: Date
  origin: string
  fxLegs: FxLeg[]
  invLegs: InvLeg[]
  premiumRate: number | null
  editHistory: EditPairEntry[]
}

/** An already-booked transaction Edit Deal Pair can re-point a leg to. */
export type AltTxn = { rfha: string; desc: string }

/** The list screen's search box and three dropdowns; '' is "All". */
export type Filters = { search: string; status: DealStatus | ''; model: string; origin: string }

export type ToastKind = '' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind; show: boolean }
