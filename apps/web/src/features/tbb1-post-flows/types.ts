/** The five application checkboxes of RFTBBB00 (P_TX … P_TF). */
export type AppKey = 'tx' | 'tm' | 'ti' | 'ts' | 'tf'

/** Posting scope radio group: P_PAYONL / P_OPVAL / P_ALLVAL. */
export type Mode = 'payonl' | 'opval' | 'allval'

/** The SELECT-OPTIONS … NO INTERVALS fields, shown as multi-selects. */
export type MultiKey = 'bukrs' | 'sgsart' | 'sfhaar' | 'ranl' | 'rldepo' | 'posacc' | 'kontrh' | 'rportb' | 'wzbetr' | 'bkklas' | 'fhazba'

/** Selection screen 1000. Dates are DD-MM-YYYY as typed; '' when empty. */
export type Form = {
  apps: Record<AppKey, boolean>
  bukrs: string[]
  rfhaFrom: string
  rfhaTo: string
  sgsart: string[]
  sfhaar: string[]
  ranl: string[]
  rldepo: string[]
  posacc: string[]
  kontrh: string[]
  rportb: string[]
  wzbetr: string[]
  bkklas: string[]
  fhazba: string[]
  sign: '' | '+' | '-'
  dzterm: string
  dbuchu: string
  wzbetrFlag: boolean
  releas: boolean
  budat: string
  monat: string
  bldat: string
  postda: boolean
  test: boolean
  mode: Mode
  pack: boolean
  psize: string
  mtA: boolean
  mtS: string
  mtRg: string
  mtNr: string
  mtPs: string
}

/** One entry of a multi-select's list: the value and the text shown for it. */
export type Option = { v: string; t: string }

/** The value helps, read from SAP (api.ts). */
export type Masters = {
  companies: Option[]
  /** ProductType with its contract type (= RANTYP, the application). */
  productTypes: (Option & { contract: string })[]
  /** TransactionType, unique per product type. */
  transactionTypes: (Option & { product: string })[]
  /** FlowType with its contract type and flow classification. */
  flowTypes: (Option & { contract: string; flowClass: string })[]
}

/**
 * One VTBFHAPO flow, with what is known of its transaction. The deal header (product type,
 * transaction type, partner, portfolio) is only known where a service serves it — FxTransaction for
 * FX deals; headerKnown says whether it is.
 */
export type Flow = {
  bukrs: string
  rfha: string
  rfhazu: string
  flowType: string
  /** Contract type (RANTYP) of the flow type; '' when the flow type is ambiguous or unknown. */
  contract: string
  /** Flow classification (BKKLAS) of the flow type. */
  flowClass: string
  amount: number
  currency: string
  sign: '' | '+' | '-'
  /** DZTERM / DBUCHUNG, ISO. */
  dueDate: string
  postingDate: string
  /** SBEWEBE: 0 not released, 1 released for posting, 2 posted. */
  postingStatus: string
  headerKnown: boolean
  productType: string
  transactionType: string
  partner: string
  portfolio: string
}

export type MsgType = 'E' | 'W' | 'S' | 'I'

/** One line of the posting log (screen 1010 list). */
export type LogLine = {
  id: number
  type: MsgType
  typeName: string
  bukrs: string
  rfha: string
  sgsart: string
  sfhaart: string
  sfhazba: string
  /** DD-MM-YYYY */
  dzterm: string
  ssign: '' | '+' | '-'
  belnr: string
  gjahr: string
  prkey: string
  text: string
  amount: number
  currency: string
  hasFlow: boolean
  msgid: string
  msgno: string
}

/** A finished run: its lines, and whether it was a preview / test run. */
export type Run = {
  lines: LogLine[]
  test: boolean
  /** True when the lines are the read-only list of due flows (no posting service). */
  preview: boolean
  /** What the user should know about this result (e.g. filters that could not be applied). */
  notes: string[]
}

export type SortField = 'typeName' | 'bukrs' | 'rfha' | 'sgsart' | 'sfhaart' | 'sfhazba' | 'dzKey' | 'ssign' | 'belnr' | 'prkey' | 'text'
export type Sort = { field: SortField | ''; dir: 'asc' | 'desc' }

export type TableState = {
  search: string
  typeFilter: string
  companyFilter: string
  sort: Sort
  page: number
  pageSize: number
  selectedId: number | null
}

export type FieldErrors = Partial<Record<'dzterm' | 'dbuchu' | 'budat' | 'bldat' | 'monat' | 'rfhaFrom' | 'rfhaTo' | 'psize' | 'mtNr' | 'mtPs' | 'apps', string>>

export type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; reason: string }
