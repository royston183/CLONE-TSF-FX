/** Report Type pill: Forex (R_FX, ZSGTSFV_FX) or Option (R_OP, ZSGTSFV_OP) deals. */
export type DealType = 'FX' | 'OP'

/** A T001 company code. */
export type Company = { code: string; name: string }

/** One external deal row (a ZSGTSFV_FX row), keyed by the view's field names. */
export type Deal = {
  _id: string
  RFHA: string
  BUKRS: string
  BUTXT: string
  SFHAART: string
  XTEXT: string
  CPAIR: string
  BS_1: string
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
  TXN_STATUS: string
  MAT_UNMAT: string
  ZTSF_DEAL_ID: string
  ZMC_REF_NO: string
  /** External Reference (editable). */
  NORDEXT: string
  /** Int Ref (editable). */
  ZOLAM_DEAL_NO: string
  _checked: boolean
  /** NDF columns (ZSGTSFV_FX NDF_DATE / NDF_REF; FxTransaction NdfFixingRate / CashSettlementAmount / CashSettlementCurrency). Blank when not served. */
  NDF_DATE?: string
  NDF_REF?: string
  NDF_RATE?: number
  ZCASH_AMT?: number
  CASH_CURR?: string
  // Forex only
  BS_2?: string
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
