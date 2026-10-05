export type PaymentCode = '' | 'P' | 'C'
export type BuySell = 'Buy' | 'Sell'

/** One transaction as the backend would hand it over, before any derived column. Dates are ISO yyyy-mm-dd. */
export type RawRow = {
  rfha: string
  bukrs: string
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
  /** 'P' partial, 'C' complete payment, '' none. */
  pc: PaymentCode
  t1Amt: number
  mtmDoc: string
  revDoc: string
}

/** A table row: the raw fields plus everything the page derives from them. */
export type Row = RawRow & {
  butxt: string
  msg: string
  fAmt: number
  fCurr: string
  usdAmt: number
  vRate: number
  vAmt: number
  /** null when the payment is complete (nothing left to value). */
  vGl: number | null
  invStat: '' | 'Yes' | 'No'
  uinvAmt: number
  uinvPer: number
  totGl: number | null
  month: string
  monat: number
}

export type ColumnType = 'select' | 'link' | 'text' | 'date' | 'amount' | 'rate' | 'percent' | 'number' | 'doc'

export type ColumnDef = {
  field: keyof Row | 'select'
  label: string
  type: ColumnType
  sticky?: 'sticky-1' | 'sticky-2' | 'sticky-3'
  cls?: string
  sort?: false
  group?: 'ext' | 'mtm'
}

export type DealFilter = 'ALL' | 'WITH' | 'WITHOUT'

export type Filters = {
  search: string
  company: string
  transaction: string
  partner: string
  currency: string
  deal: DealFilter
}

export type SortField = Exclude<ColumnDef['field'], 'select'>
export type Sort = { field: SortField; dir: 1 | -1 }

export type DocField = 'mtmDoc' | 'revDoc'

export type LogEntry = {
  ok: boolean
  rfha: string
  doc: string
  diff: number | null
  message: string
  rate: number
  kind: 'MTM' | 'Reversal'
}

export type DocCounters = { doc: number; rev: number }

export type DetailCell = { label: string; value: string }

export type CalendarCell = {
  date: Date
  day: number
  out: boolean
  weekend: boolean
  today: boolean
  selected: boolean
}
