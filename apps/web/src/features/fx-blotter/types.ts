// ---------------------------------------------------------------- reference data

export type Trader = { code: string; name: string; group: string; teamLead: boolean }
export type Group = { code: string; desc: string }
export type Entity = {
  code: string
  cocode: string
  name: string
  currency: string
  defaultProfitCenter: string
  businessArea: string
}
/** `group` is 'ALL' for the internal counterparties. Upload adds partners it does not know. */
export type BusinessPartner = { code: string; short: string; name: string; group: string }
/** valueDateOffset is calendar days from the trade date; `ndf` turns on the fixing fields. */
export type TransactionType = { code: string; desc: string; sapType: string; valueDateOffset: number; ndf: boolean }
/** quotePer is 100 for the currencies quoted per 100 units (IDR / KWA / VND / TWD). */
export type CurrencyPair = { pair: string; lead: string; follow: string; quotePer: number; baseRate: number }
export type CodeDesc = { code: string; desc: string }
export type CodeLabel = { code: string; label: string }
export type Portfolio = { code: string; desc: string; group: string }
export type FixingReference = { code: string; pair: string }

export type LegTemplate = { from: string; to: string; bs1: string; bs2: string }
/**
 * An FX model: its 3-entity Entity String and currency pair, plus the D1 / D2 leg template
 * each Master Contract under it expects (D1 the financing leg, D2 the offsetting one).
 */
export type FxModel = {
  code: string
  desc: string
  entities: string[]
  pair: string
  d1: LegTemplate
  d2: LegTemplate
  spreadBp: number
  ssEligible?: boolean
  tolerancePct: number
  valueDateToleranceDays: number
}

export type McSeed = {
  n: string
  model: string
  comm: string
  desc: string
  amtUSD: number
  shipStartOff: number
  shipDur: number
  group: string
}

/** A Master Contract; FX legs draw its USD balance (amtUSD − utilizedUSD) down. */
export type MasterContract = {
  mcNumber: string
  fxModel: string
  modelDesc: string
  entities: string[]
  currPair: string
  commodityCode: string
  commodityDesc: string
  mcDate: Date
  shipStart: Date
  shipEnd: Date
  amtUSD: number
  utilizedUSD: number
  group: string
  portShipment: string
  portDestination: string
}

/** The original checks for 'REVERSED' when listing open Deal IDs, though nothing sets it. */
export type DealKind = 'PAIR' | 'SINGLE' | 'SS' | 'REVERSED'
export type DealRecord = {
  dealId: string
  mcNumber: string
  model: string
  type: DealKind
  legs: string[]
  createdOn: Date
}

// ---------------------------------------------------------------- blotter

export type RowStatus = 'DRAFT' | 'CREATED' | 'RELEASED' | 'REVERSED'
export type StatusFilter = 'ALL' | RowStatus

/** A blank draft row holds '' in its number cells until something is entered. */
export type Num = number | ''

export type BlotterRow = {
  id: string
  seq: number
  status: RowStatus
  draftLabel: string
  /** The RFHA; '' while a draft. */
  transactionNumber: string
  group: string
  trader: string
  tradeDate: Date | null
  entity: string
  bp: string
  txnType: string
  buySell: string
  buySell2: string
  curr1: string
  amt1: Num
  curr2: string
  amt2: Num
  spotRate: Num
  swapPoints: Num
  totalRate: Num
  valueDate: Date | null
  ndfDate: Date | null
  ndfRef: string
  portfolio: string
  assignment: string
  profitCenter: string
  businessArea: string
  mcRef: string
  dealId: string
  dealType: string
  fxModel: string
  notes: string
  // Only rows made by Upload carry these.
  companyCode?: string
  externalReference?: string
  financeProject?: string
  foRemark?: string
  moRemark?: string
  dealDescription?: string
  dealSequence?: string
  uploaded?: boolean
  settled?: boolean
}

export type TextField =
  | 'entity'
  | 'bp'
  | 'txnType'
  | 'buySell'
  | 'buySell2'
  | 'curr1'
  | 'curr2'
  | 'assignment'
  | 'portfolio'
  | 'profitCenter'
  | 'businessArea'
  | 'ndfRef'
export type NumField = 'amt1' | 'swapPoints' | 'totalRate'
export type DateField = 'tradeDate' | 'valueDate' | 'ndfDate'

/** The page's module-level counters: RFHA numbers, Deal IDs, draft labels and row order. */
export type Counters = { rfha: number; dealId: number; ssDealId: number; draft: number; seq: number }

/** The context row: Blotter Date and the Group / Trader dropdowns as currently selected. */
export type Ctx = { date: Date; group: string; trader: string }

/** Everything the legacy script kept in module variables and mutated in place. */
export type Blotter = {
  rows: BlotterRow[]
  contracts: MasterContract[]
  deals: DealRecord[]
  partners: BusinessPartner[]
  counters: Counters
  ctx: Ctx
  /** Checked row ids, in the order they were checked (D1 is the first of a pair). */
  checked: string[]
  locked: boolean
}

export type SortKey = 'seq' | 'transactionNumber' | 'tradeDate' | 'valueDate'
export type Sort = { key: SortKey; dir: 1 | -1 }

export type DropAction = 'create' | 'release' | 'ss'

export type Kpis = { total: number; counts: Record<RowStatus, number>; notional: number }

export type Option = { value: string; label: string }

export type Check = { ok: boolean; msgs: string[] }

// ---------------------------------------------------------------- auto deal

export type AutoLeg = {
  leg: 'Deal 1' | 'Deal 2'
  tradeDate: Date | null
  valueDate: Date | null
  entity: string
  txnType: string
  partner: string
  bs: string
  bs2: string
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  rate: number
  swap: number
  spot: number
  mode: string
  fixingDate: Date | null
  fixRef: string
}
export type AutoLegField =
  'tradeDate' | 'valueDate' | 'fixingDate' | 'amt1' | 'rate' | 'swap' | 'spot' | 'partner' | 'mode' | 'fixRef'

export type AutoSpotForm = {
  dealId: string
  company: string
  bp: string
  tradeDate: string
  valueDate: string
  rate: string
  buyCurr: string
  buyAmt: string
  sellCurr: string
  sellAmt: string
}

// ---------------------------------------------------------------- FX Txn List

export type TxnListCriteria = {
  date: string
  group: string
  trader: string
  cpair: string
  layout: string
  email: boolean
}

// ---------------------------------------------------------------- upload

export type UploadLevel = 'ORDER' | 'CONTRACT' | 'SETTLEMENT'

/** One upload line after its headers are matched to the logical fields; every value is text. */
export type UploadRow = {
  companyCode: string
  tradeDate: string
  bp: string
  profitCenter: string
  businessArea: string
  txnType: string
  curr1: string
  amt1: string
  curr2: string
  deal?: string
  buySell: string
  valueDate: string
  totalRate: string
  swap: string
  spot: string
  ndfDate: string
  ndfRef: string
  assignment: string
  remark: string
  externalRef: string
  mcRef: string
  dealId: string
  dealDesc: string
  dealType: string
  dealSeq: string
  blotterDate: string
  financeProject: string
  txnStatus: string
  moRemark: string
  foRemark: string
}

export type UploadResult = {
  sr: number
  ok: boolean
  bp: string
  curr1: string
  curr2: string
  amt1: Num
  amt2: Num
  valueDate: Date | null
  tradeDate: Date | null
  rfha: string
  msg: string
}

// ---------------------------------------------------------------- page chrome

export type ModalId = 'action' | 'view' | 'notes' | 'assign' | 'mc' | 'auto' | 'ss' | 'autospot' | 'list' | 'upload'

export type ToastKind = '' | 'error' | 'success' | 'warn'
export type Toast = { message: string; kind: ToastKind; id: number }
