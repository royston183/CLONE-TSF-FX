export type Side = 'Buy' | 'Sell'

export type CompanyCode = {
  code: string
  name: string
  prctr: string
  pcName: string
  rbusa: string
  baName: string
}

export type BusinessPartner = { id: string; name: string }

/** One currency pair with the quotation orientation (f = base currency, t = quote currency). */
export type CurrencyPair = { pair: string; f: string; t: string }

/** A swap curve point: tenor in months and the swap points for it. */
export type SwapPoint = readonly [months: number, points: number]

/** One FX transaction behind view ZSGTSFV_FX, before any lookup is joined in. Dates are ISO yyyy-mm-dd. */
export type DealSpec = {
  bukrs: string
  rfha: string
  bp: string
  sgsart: string
  pair: string
  side: Side
  amt: number
  rate: number
  trade: string
  value: string
  st: string
  saktiv?: string
  ext: string
}

/** ZSGTRMTR_ACC_TBL row: posting accounts for one company code, gain/loss type and NDF flag. */
export type AccConfig = {
  zbukrs: string
  int_ext: 'T'
  type: 'ML' | 'MG'
  zndf: '' | 'X'
  gl_debit: string
  gl_credit: string
  pc_debit: string
  pc_credit: string
  ba_debit: string
  ba_credit: string
  doc_header: string
  doc_debit: string
  doc_credit: string
}

/** The raw view record (ZSGTSFV_FX): a deal spec with its company, partner and pair lookups joined in. */
export type ViewRecord = {
  bukrs: string
  butxt: string
  rfha: string
  kontrh: string
  bp_name: string
  sgsart: string
  xtext: string
  cpair: string
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  bs_1: Side
  bs_2: Side
  f_curr1: string
  t_curr1: string
  c_rate: number
  dblfz: string
  delfz: string
  txn_status: string
  saktiv: string
  nordext: string
  ztsf_deal_id: string
  zolam_deal_no: string
  prctr: string
  pc_name: string
  rbusa: string
  ba_name: string
}

/** A list row: the view record plus every column the valuation derives. */
export type MtmRow = ViewRecord & {
  f_amt: number
  f_curr: string
  bs_o: '1' | '2'
  bs_bu: Side
  usd_amt: number
  v_spot: number
  monat: number
  v_swap: number
  v_rate: number
  v_amt: number
  v_gl: number
  month: string
  mtm_doc: string
  rev_doc: string
  msg: string
  /** company code | transaction */
  id: string
}

/** ZSGTSFTR_MTMDATA: one posted MTM document and its reversal. */
export type MtmRecord = {
  zbukrs: string
  zrfha: string
  zdate: string
  ztype: '01'
  zdoc: string
  zrev_doc: string
  zmsg: string
}

/** The mutable "tables" of the original, held immutably: the posted documents and the number range. */
export type MockDb = { mtmData: MtmRecord[]; nextDoc: number }

export type ColumnKey =
  | 'bukrs'
  | 'butxt'
  | 'rfha'
  | 'nordext'
  | 'ztsf_deal_id'
  | 'zolam_deal_no'
  | 'kontrh'
  | 'bp_name'
  | 'sgsart'
  | 'xtext'
  | 'cpair'
  | 'bs_bu'
  | 'dblfz'
  | 'delfz'
  | 'month'
  | 'monat'
  | 'f_amt'
  | 'f_curr'
  | 'c_rate'
  | 'usd_amt'
  | 'v_spot'
  | 'v_swap'
  | 'v_rate'
  | 'v_amt'
  | 'v_gl'
  | 'mtm_doc'
  | 'rev_doc'
  | 'msg'

export type ColumnDef = {
  label: string
  type: 'text' | 'date' | 'num' | 'amt' | 'rate'
  grp?: 'ext' | 'mtm'
  link?: 'txn' | 'doc'
  pin?: boolean
  /** Column whose value the sort uses instead of its own (Exp Mth-yr sorts by value date). */
  sortKey?: ColumnKey
}

export type Layout = { id: string; label: string; cols: readonly ColumnKey[] }

export type Posting = 'view' | 'post'

export type SelectionParams = { company: string[]; keyDate: string; posting: Posting }

export type Filters = { rfha: string; bp: string; pair: string; deal: 'all' | 'ndf' | 'del' }

export type Sort = { field: ColumnKey | null; dir: 'asc' | 'desc' }

/** One row of the message log (gt_msg): S = posted, E = BAPI error. */
export type LogMsg = {
  type: 'S' | 'E'
  rfha: string
  doc: string
  diff: number
  rate: number
  message: string
}

/** A mass posting waiting on the confirmation popup. */
export type PendingRun = {
  params: SelectionParams
  eligible: MtmRow[]
  listed: number
}

export type DetailItem = { label: string; value: string; full?: boolean }

export type PostingItem = {
  item: number
  gl: string
  amount: number
  pc: string
  ba: string
  text: string
}

export type DocView = {
  title: string
  banner: string
  reversal: boolean
  header: DetailItem[]
  items: PostingItem[]
}

export type TxnView = {
  title: string
  general: DetailItem[]
  legs: { head: string; value: string }[]
  assignment: DetailItem[]
}

export type CalendarView = { year: number; month: number }

export type CalendarDay = { day: number; muted: boolean; selected: boolean; today: boolean }

export type FieldErrors = { company: string | null; keyDate: string | null }
