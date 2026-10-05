export type BuySell = 'Buy' | 'Sell'

/** Part-payment flag on the SAP row: 'P' partial, 'C' complete, '' none. */
export type PaymentCode = '' | 'P' | 'C'

/** What the SAP report hands over for one transaction, before the India derivation. */
export type RawRow = {
  rfha: string
  bukrs: string
  butxt: string
  sgsart: string
  xtext: string
  kontrh: string
  bpName: string
  tradeDate: string
  valueDate: string
  buySell: BuySell
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  cRate: number
  vSpot: number
  vSwap: number
  cpair: string
  ztsfDealId: string
  zolamDealNo: string
  externalRef: string
  pc: PaymentCode
  t1Amt: number
  mtmDoc: string
  revDoc: string
  mtmDoc2: string
  revDoc2: string
  msg: string
}

/** A raw row plus everything the India rules derive from it. */
export type Row = RawRow & {
  fAmt: number
  fCurr: string
  ccAmt: number
  vRate: number
  vAmt: number
  vGl: number | null
  invStat: '' | 'Yes' | 'No'
  valMer: number | null
  uinvAmt: number
  uinvPer: number
  totGl: number | null
  month: string
  monat: number
}

export type ColumnField = keyof Row
export type ColumnType = 'select' | 'link' | 'text' | 'date' | 'amount' | 'rate' | 'percent' | 'number' | 'doc'
export type ColumnGroup = 'ext' | 'mtm'
export type StickyClass = 'sticky-1' | 'sticky-2' | 'sticky-3'

export type Column = {
  field: ColumnField | 'select'
  label: string
  type: ColumnType
  sticky?: StickyClass
  cls?: string
  group?: ColumnGroup
  sort?: false
}

export type DocField = 'mtmDoc' | 'revDoc' | 'mtmDoc2' | 'revDoc2'

export type DealTypeFilter = 'ALL' | 'WITH' | 'WITHOUT'

export type Filters = {
  search: string
  company: string
  transaction: string
  partner: string
  currency: string
  dealType: DealTypeFilter
}

export type Sort = { field: ColumnField; dir: 1 | -1 }

export type SelectOption = { value: string; label: string }

export type LogKind = 'MTM Ledger 1' | 'Reversal Ledger 1' | 'MTM Ledger 2' | 'Reversal Ledger 2'

export type PostLog = {
  ok: boolean
  rfha: string
  doc: string
  diff: number | null
  message: string
  rate: number
  kind: LogKind
}

export type Counters = { doc: number; rev: number }

export type ToastKind = 'info' | 'success'
export type ToastState = { text: string; kind: ToastKind; show: boolean }

export type ModalState =
  | { kind: 'txn'; rfha: string }
  | { kind: 'doc'; rfha: string; field: DocField }
  | { kind: 'log'; logs: PostLog[] }
