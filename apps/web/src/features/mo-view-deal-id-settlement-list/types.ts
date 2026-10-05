export type Region = { id: string; name: string }
export type Entity = { code: string; cocode: string; name: string; region: string; origin: boolean }
export type FxModel = {
  code: string
  desc: string
  entities: readonly string[]
  curr: readonly string[]
  entityId: string
  currId: string
}
export type Commodity = { code: string; desc: string }
export type CoArea = { code: string; desc: string }
export type DealStatus = { code: string; desc: string }
export type LayoutChoice = { value: string; label: string }

export type McSeed = {
  ref: string
  model: string
  comm: string
  qty: string
  desc: string
  mcDate: string
  amtUSD: number
  shipStartOff: number
  shipDur: number
  port: { ship: string; dest: string }
}

export type DealSeed = {
  id: string
  mc: string
  stat: string
  trd: string
  val: string
  bank: number
  co: string
  pl: number
  uti: number
  spot: boolean
}

export type MasterContract = {
  mcRef: string
  fxModel: string
  modelDesc: string
  entities: readonly string[]
  currChain: readonly string[]
  originEntity: string
  region: string
  commodityCode: string
  commodityDesc: string
  qty: string
  mcDate: Date
  amtUSD: number
  shipStart: Date
  shipEnd: Date
  portOfShipment: string
  portOfDestination: string
}

export type Deal = {
  dealId: string
  dealType: string
  subType: string
  dealDesc: string
  shortDesc: string
  mcRef: string
  fxModel: string
  modelDesc: string
  origin: string
  region: string
  status: string
  statusDesc: string
  confirm: boolean
  tradeDate: Date
  valueDate: Date
  revisedEndDate: Date | null
  coArea: string
  partner: string
  plAmt: number
  plCurr: string
  plRate: number
  utiAmt: number
  fixingDay: Date
  spot: boolean
  createdBy: string
  createdDate: Date
  createdTime: string
  changedBy: string
  changedDate: Date | null
  changedTime: string
}

export type SortKey = 'dealId' | 'mcRef' | 'statusDesc' | 'tradeDate' | 'valueDate' | 'utiAmt'
export type SortDir = 1 | -1
export type Sort = { key: SortKey; dir: SortDir }

/** The KPI card filter: ALL (none), OPEN (awaiting settlement) or DONE (ready / settled). */
export type KpiFilter = 'ALL' | 'OPEN' | 'DONE'

export type Filters = {
  search: string
  deal: string
  status: string
  region: string
  entity: string
  co: string
  /** DD.MM.YYYY, or '' when unset. */
  dateFrom: string
  dateTo: string
  layout: string
  kpi: KpiFilter
  /** The hidden P_MAST selection-screen parameter, set from the Master Contract modal. */
  contextMc: string | null
}

export type Kpis = { total: number; pending: number; settled: number; utiTotal: number }

export type InvoiceLeg = {
  leg: string
  seller: string
  buyer: string
  curr: string
  amt: number
  markup: number | null
}

export type PagerItem = { kind: 'page'; page: number } | { kind: 'gap'; key: string }
