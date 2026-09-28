/** Report Type pill: Forex or Option deals. */
export type DealType = 'FX' | 'OP'

export type Company = { code: string; name: string }
export type FxPair = { pair: string; c1: string; c2: string; spot: number }
export type Trader = { code: string; name: string }
export type Partner = { code: string; name: string }
export type TxnType = { code: string; desc: string }
export type Portfolio = { code: string; name: string }

export type TxnStatus = 'Active' | 'Pending' | 'Settled'
export type MatchStatus = 'Matched' | 'Unmatched'

/** One external deal row, keyed by the original's SAP field names. */
export type Deal = {
  _id: string
  RFHA: string
  BUKRS: string
  BUTXT: string
  SFHAART: string
  XTEXT: string
  CPAIR: string
  BS_1: 'Buy' | 'Sell'
  CURR1: string
  AMT1: number
  DBLFZ: string
  DELFZ: string
  RDEALER: string
  BP_NAME: string
  KONTRH: string
  RBUSA: string
  RPORTB: string
  PRCTR: string
  TXN_STATUS: TxnStatus
  MAT_UNMAT: MatchStatus
  ZTSF_DEAL_ID: string
  ZMC_REF_NO: string
  /** External Reference (editable). */
  NORDEXT: string
  /** Int Ref (editable). */
  ZOLAM_DEAL_NO: string
  _checked: boolean
  // Forex only
  BS_2?: 'Buy' | 'Sell'
  CURR2?: string
  AMT2?: number
  SPOT?: number
  SWAP?: number
  TOT_RATE?: number
  // Option only
  OPTION_TYPE?: string
  STRIKE_RATE?: number
  PREMIUM_AMT?: number
  PREMIUM_CURR?: string
  EXPIRY_DATE?: string
}

export type ColumnKey = Exclude<keyof Deal, '_id' | '_checked'>
export type ColumnType = 'hotspot' | 'text' | 'number' | 'rate' | 'date' | 'status' | 'status2' | 'edit'
export type Column = { key: ColumnKey; label: string; type: ColumnType; pin?: true }

/** The two inline-editable columns. */
export type EditKey = 'NORDEXT' | 'ZOLAM_DEAL_NO'

/** Basic Selection. keyDate is the DD-MM-YYYY text of the Key Date box. */
export type Selection = {
  coFrom: string
  coTo: string
  keyDate: string
  dealType: DealType
  withRef: boolean
  layout: string
}

export type ColFilters = { type: string; status: string; trader: string }
export type SortState = { field: ColumnKey | null; dir: 'asc' | 'desc' }

export type Toast = { id: number; message: string; error: boolean }
