export type Company = {
  code: string
  name: string
  entity: string
  /** ZGTCATR_PARAM param1; only TH10 has it, which switches on the DE2/DE6 split and the THB column. */
  localCurrency: string
}

export type Partner = { id: string; name: string; country: string }

/** A currency pair with the parameters of the deterministic mock market. */
export type Pair = {
  code: string
  f: string
  t: string
  base: number
  trend: number
  phase: number
  dp: number
  perYear: number
}

export type LayoutOption = { id: string; text: string }

/** ZSGTRMTR_EXT_FX row: ztsf = 'X' means TSF ('T') accounting, otherwise External ('E'). */
export type ExtFx = { zsgsart: string; zsfhaart: string; ztsf: string }

export type AccCat = 'FV' | 'CT'
export type DealKind = 'FWD' | 'NDF'
export type Side = 'Buy' | 'Sell'

/** One deal of the demo book, positional like the original's deal(...) call. */
export type DealSeed = readonly [
  rfha: string,
  bukrs: string,
  src: 'TSF' | 'TRM',
  tsfCode: string,
  status: string,
  partnerId: string,
  pair: string,
  side: Side,
  notional: number,
  trade: string,
  value: string,
  kind: DealKind,
  accCat: AccCat,
]

/** A deal as it sits in the system, before any valuation. */
export type DealBase = {
  bukrs: string
  butxt: string
  rfha: string
  src: 'TSF' | 'TRM'
  tsf_code: string
  txn_status: string
  kontrh: string
  bp_name: string
  country: string
  cpair: string
  f_curr1: string
  t_curr1: string
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  c_rate: number
  bs_1: Side
  bs_2: Side
  bs_o: '1' | '2'
  sfhaart: string
  sgsart: string
  xtext: string
  dblfz: string
  delfz: string
  ndf_date: string
  ndf_rate: number
  ndf_ref: string
  zsett_pair: string
  prctr: string
  rbusa: string
  rportb: AccCat
  xportb: string
  refer: string
  ztsf_deal_id: string
  zolam_deal_no: string
}

/** A deal valuated for a key date: one row of the ALV list. */
export type Deal = DealBase & {
  ext_stat_desc: string
  landx50: string
  f_curr: string
  f_amt: number
  bs_bu: string
  mtm_doc: string
  rev_doc: string
  msg: string
  usd_amt: number
  v_spot: number
  v_swap: number
  monat: number
  v_rate: number
  c_rate_n: number
  v_spot_n: number
  v_swap_n: number
  v_rate_n: number
  v_amt: number
  v_gl: number
  v_gl_th: number
  month: string
}

export type ColumnKey = keyof Deal
export type ColumnType = 'text' | 'link' | 'status' | 'date' | 'num' | 'amt' | 'rate' | 'swap' | 'gl'
/** ext = grey "Transaction Data - External", mtm = blue "MTM Data". */
export type ColumnGroup = 'ext' | 'mtm'

/** ALV field catalogue entry. layouts holds d (default), f (full) and v (valuation) letters. */
export type Column = {
  key: ColumnKey
  label: string
  type: ColumnType
  action?: 'deal' | 'doc'
  sortKey?: ColumnKey
  blankZero?: boolean
  group?: ColumnGroup
  layouts: string
  thOnly?: boolean
}

export type MonthBucket = { zmonth: number; zmonth_date: string; zmonth_days: number }
export type SwapPoint = { dlfz: number; kkurs: number }
export type MarketData = { spots: Record<string, number>; swaps: Record<string, SwapPoint[]> }

/** ZSGTRMTR_ACC_TBL row: accounting determination. */
export type AccountingRow = {
  zbukrs: string
  int_ext: 'T' | 'E'
  type: 'MG' | 'ML'
  zndf: '' | 'X'
  acc_cat: string
  gl_debit: string
  gl_credit: string
  pc_debit: string
  ba_debit: string
  pc_credit: string
  ba_credit: string
  doc_debit: string
  doc_credit: string
  doc_header: string
}

export type DocHeader = {
  comp_code: string
  doc_date: string
  pstng_date: string
  doc_type: string
  header_txt: string
  ref_doc_no: string
}

export type DocItem = {
  itemno: number
  gl_account: string
  profit_ctr: string
  bus_area: string
  item_text: string
  currency: string
  amount: number
}

export type AccountingDocument = {
  docNo: string
  bukrs: string
  year: string
  header: DocHeader
  items: DocItem[]
  reversalOf: string
  reversalReason: string
}

/** ZSGTSFTR_MTMDATA mimic: what was already posted for a deal at a key date. */
export type PostedRecord = { bukrs: string; rfha: string; keyYmd: string; doc: string; rev: string; msg: string }

/** The posting stores. Immutable: every posting returns a new one. */
export type Store = {
  posted: Readonly<Record<string, PostedRecord>>
  docs: Readonly<Record<string, AccountingDocument>>
  nextDoc: number
}

/** One row of the Message Log (GT_MSG). */
export type MsgRow = {
  ok: boolean
  bukrs: string
  rfha: string
  doc: string
  diff: number
  message: string
  cswap_rate: number
}

export type PostingContext = { keyYmd: string; localCurrency: string }

/** What the last Execute ran with. */
export type Executed = { bukrs: string; keyYmd: string; localCurrency: string; th10: boolean }

export type PostingType = 'post' | 'view'
export type DealTypeFilter = 'all' | 'ndf' | 'deliverable'

/** The run parameters at the top of the screen, as they stand when Execute is pressed. */
export type Params = { bukrs: string; keyDate: string; posting: PostingType; layout: string }

export type Filters = {
  dealFrom: string
  dealTo: string
  bpFrom: string
  bpTo: string
  pair: string
  dealType: DealTypeFilter
  source: string
}

export type Sort = { field: ColumnKey; dir: 'asc' | 'desc' }

export type ParamErrors = { bukrs: string; keyDate: string }

export type Toast = { message: string; error: boolean }
