export type Payment = 'P' | 'C' | ''
export type BuySell = 'Buy' | 'Sell'

/** A transaction as the demo hands it over, before any amount is derived. Dates are ISO (YYYY-MM-DD). */
export type RawRow = {
  rfha: string
  bukrs: string
  butxt: string
  /** Local currency of the company code. */
  zWaers: string
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
  /** Payment flag: P partial, C complete, blank none. */
  pc: Payment
  t1Amt: number
  mtmDoc: string
  revDoc: string
}

/** A raw row plus everything the page derives from it. */
export type Row = RawRow & {
  msg: string
  fAmt: number
  fCurr: string
  ccAmt: number
  vRate: number
  vAmt: number
  vCgl: number
  valMer: number
  /** Valuation G/L in USD; null once the payment is complete. */
  vGl: number | null
  invStat: string
  uinvAmt: number
  uinvPer: number
  locUninv: number
  totGl: number
  month: string
  monat: number
}

export type RowField = keyof Row

export type ColumnType = 'select' | 'link' | 'text' | 'date' | 'amount' | 'rate' | 'number' | 'percent' | 'doc'

export type Column = {
  field: RowField | 'select'
  label: string
  type: ColumnType
  sticky?: string
  cls?: string
  group?: 'ext' | 'mtm'
  sort?: false
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

export type Sort = { field: RowField; dir: 1 | -1 }

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

export type Counters = { doc: number; rev: number }

export type CalendarView = { y: number; m: number }

export type CalendarCell = { date: Date; day: number; out: boolean; weekend: boolean }

export type Detail = { k: string; v: string }
