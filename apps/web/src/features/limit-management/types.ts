/** One row of the limits table, as SAP holds it (see api.ts for the column contract). */
export type RawLimit = {
  /** Stable row id: the key columns joined, so an update can address the row. */
  id: string
  pair: string
  year: number
  startDt: string
  endDt: string
  curr: string
  /** Initial approved amount. */
  zini: number
  /** Total approved amount (initial plus approved additions). */
  zad: number
  /** Amount awaiting approval. */
  zunaprov: number
  /** Utilised amount, ZUTL_AMT of the limit row. */
  utl: number
  app: boolean
  rej: boolean
  addlim: boolean
}

export type LimitKind = 'ok' | 'wait' | 'bad'
export type LimitLight = 'ok' | 'bad' | 'led' | 'wait'

/** A limit row as the table shows it: raw values plus the derived columns. */
export type Limit = RawLimit & {
  balance: number
  total: number
  zin: number
  zadd: number
  statusText: string
  kind: LimitKind
  light: LimitLight
}

/** A D1 deal counted against a limit. */
export type LimitDeal = {
  dealId: string
  desc: string
  bpNo: string
  bpName: string
  pair: string
  model: string
  dealType: string
  curr1: string
  amt1: number
  curr2: string
  amt2: number
  bs1: string
  rate: number
  tradeDate: string
  valueDate: string
  startDate: string
  endDate: string
  mcRef: string
  mcDate: string
  mcAmt: number
  region: string
  statusDesc: string
  txnNo: string
  /** Buy / sell legs, as PROCESS_SUM1 splits them. */
  buyAmt: number
  buyCurr: string
  sellAmt: number
  sellCurr: string
  /** The USD volume the deal counts for. */
  usdAmt: number
  /** The deal's USD leg amount. */
  dealAmt: number
}

export type BankRow = { bpNo: string; name: string; usd: number; txn: number; pct: number; rank: number }
export type BankSummary = { rows: BankRow[]; total: { usd: number; txn: number; pct: number } }

export type MailPreview = { subject: string; rows: [string, string][] }
