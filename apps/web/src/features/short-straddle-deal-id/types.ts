export type Region = { id: string; name: string }
export type Entity = { code: string; name: string; region: string }
/** A Short Straddle FX Model (ZSS = 'X'). The last entity / currency is the origin leg. */
export type FxModel = {
  code: string
  desc: string
  entities: string[]
  curr: string[]
  entityId: string
  currId: string
  /** RULE_BT ZORIGIN; '' on a dummy model, whose origin is its last entity leg. */
  origin: string
  /** RULE_BT ZTYPE / ZSUB_TYPE: the new Deal ID's ZDEAL_TYPE / ZSUB_TYPE key columns. */
  dealType: string
  subType: string
}
export type Commodity = { code: string; desc: string }
export type PaymentTerm = { code: string; desc: string }
export type PortPair = { ship: string; dest: string }

/** ABAP MC status codes shown by this report. */
export type McStatus = '01' | '02' | '03' | '04' | '09' | '21'
/** ABAP Deal ID status codes; '30' (Cancelled) is excluded from the utilized amount. */
export type DealStatus = '01' | '10' | '30'

export type DealSeed = { stat: DealStatus; amtUSD: number; offsetDays: number }

/** One row of the legacy MC_SEED block, before the derived fields are filled in. */
export type McSeed = {
  ref: number
  model: string
  comm: string
  stat: McStatus
  amt: number
  exRate: number
  /** DD.MM.YYYY */
  mcDate: string
  shipStartOff: number
  shipDur: number
  moNote: string
  foNote: string
  deals: DealSeed[]
}

export type MasterContract = {
  mcRef: number
  mcDesc: string
  mcDate: Date
  sellBuy: 'S' | 'B'
  origin: string
  amtUSD: number
  curr: string
  shipStart: Date
  shipEnd: Date
  commodityCode: string
  commodityDesc: string
  entityId: string
  entityDesc: string
  currId: string
  currDesc: string
  payTerms: string
  fxModel: string
  modelDesc: string
  amtOrigin: number
  origCurr: string
  exRate: number
  mcStat: McStatus
  pos: string
  pod: string
  moRemarks: string
  foRemarks: string
  createdBy: string
  createdOn: Date
  createdTime: string
  changedBy: string
  changedOn: Date | null
  docDate: Date
  sourcePath: string
}

export type Deal = {
  dealId: string
  mcRef: number
  dealDesc: string
  dealType: string
  subType: string
  model: string
  sDate: Date
  eDate: Date
  amtUSD: number
  tradeCode: string
  dealStat: DealStatus
  currId: string
  currDesc: string
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  createdBy: string
  createdOn: Date
  createdTime: string
}

/** Utilized / balance / expiry amounts of one Master Contract. */
export type Amounts = { uti: number; bal: number; exp: number }

/** 'ALL' or one of the status codes. */
export type StatusFilter = 'ALL' | McStatus

export type Filters = {
  search: string
  /** Ship End Date ("As of Date"), YYYY-MM-DD as held by the date input. */
  asOf: string
  status: StatusFilter
  entity: string
  region: string
  model: string
}

export type EditForm = { amount: string; payTerms: string; model: string }

export type ToastKind = '' | 'success' | 'error'
/** show=false keeps the last message in place while the toast fades out, as the original did. */
export type Toast = { message: string; kind: ToastKind; show: boolean }

export type ModalId = 'mcdetail' | 'dealbreak' | 'edit' | 'deal' | 'reverse'
export type DropAction = 'edit' | 'deal' | 'reverse'
