/** One company code (VTBFHA-BUKRS) with the values derived from it for every deal and for the letter. */
export type Company = {
  code: string
  name: string
  tsfEntity: string
  pair: string
  local: string
  ba: string
  baName: string
  pc: string
  pcName: string
  /** Settlement account printed on the bank letter. */
  acct: string
}

/** A bank business partner (VTBFHA-KONTRH). */
export type Partner = {
  id: string
  name: string
  contact: string
  swift: string
  formal: string
  addr: [string, string, string]
  attn: string
}

export type Portfolio = { rportb: string; xportb: string }

/** Buy or Sell of the first currency. */
export type BuySell = 'B' | 'S'

/**
 * rfha, company, partner index, buy/sell, notional USD, contract rate, fixing rate, value date,
 * tenor days, txn_status, saktiv, sgsart, MC reference, trader index.
 */
export type DealSeed = readonly [
  string,
  string,
  number,
  BuySell,
  number,
  number,
  number,
  string,
  number,
  string,
  string,
  string,
  string,
  number,
]

/** BKPF seed: bukrs, belnr, gjahr, xblnr (= rfha), waers, blart, budat, xref2_hd, xreversal, xreversing. */
export type BkpfSeed = readonly [string, string, string, string, string, string, string, string, string, string]

/** A VTBFHA / ZSGTSFV_FX row. Field names keep the SAP names the report uses. */
export type Deal = {
  bukrs: string
  rfha: string
  saktiv: string
  sgsart: string
  rfhazul: string
  butxt: string
  ltx: string
  sfhaart: string
  xtext: string
  kontrh: string
  bp_name: string
  gsppart: string
  blotter_date: string
  prctr: string
  pc_name: string
  rbusa: string
  ba_name: string
  rportb: string
  xportb: string
  refer: string
  nordext: string
  dblfz: string
  delfz: string
  zcom_id: string
  rdealer: string
  txn_status: string
  ztsf_deal_id: string
  ztsf_mc_ref_no: string
  ndf_date: string
  ndf_ref: string
  ndf_rate: number
  fo_remark: string
  mo_remark: string
  ndf_fo_rem: string
  ndf_mo_rem: string
  bs: BuySell
  bs_1: string
  bs_2: string
  curr1: string
  amt1: number
  curr2: string
  amt2: number
  ospot: number
  oswap: number
  otot_rate: number
  spot: number
  swap: number
  tot_rate: number
  t_rate: number
  cpair: string
  zwaers: string
  cash_curr: string
  zcash_amt: number
  cruser: string
  dcrdat: string
  upuser: string
  dupdat: string
  fi_doc: string
  /** Fiscal year of the matched FI document (GET_DATA fills it; empty when none). */
  fi_gjahr?: string
}

/** BKPF header row. */
export type Bkpf = {
  bukrs: string
  belnr: string
  gjahr: string
  xblnr: string
  waers: string
  blart: string
  budat: string
  xref2_hd: string
  xreversal: string
  xreversing: string
}

/** VTBFHAPO flow row. */
export type FlowRow = { bukrs: string; rfha: string; rfhazu: string; sbewebe: string }

/** The mock database: stands in for VTBFHA / ZSGTSFV_FX, VTBFHAPO and BKPF. */
export type Db = { vtbfha: Deal[]; vtbfhapo: FlowRow[]; bkpf: Bkpf[]; nextDocNo: number }

/** The report's select-options. Dates are ISO yyyy-mm-dd, empty when not set. */
export type Criteria = { bukrs: string[]; dateFrom: string; dateTo: string; rfha: string }

/** A date field's typed text that could not be parsed. */
export type DateErr = { from: boolean; to: boolean }

export type CriteriaKey = 'bukrs' | 'dateFrom' | 'dateTo'
export type CriteriaError = { key: CriteriaKey; msg: string }

export type ColumnType = 'link' | 'status' | 'amount' | 'rate' | 'date' | 'fidoc'

export type ColumnKey =
  | 'rfha'
  | 'bukrs'
  | 'butxt'
  | 'zcom_id'
  | 'ztsf_deal_id'
  | 'ztsf_mc_ref_no'
  | 'ltx'
  | 'txn_status'
  | 'kontrh'
  | 'bp_name'
  | 'gsppart'
  | 'bs_1'
  | 'cpair'
  | 'curr1'
  | 'amt1'
  | 'curr2'
  | 'amt2'
  | 'dblfz'
  | 'delfz'
  | 'ndf_date'
  | 'ndf_ref'
  | 'ospot'
  | 'oswap'
  | 'otot_rate'
  | 'ndf_rate'
  | 'cash_curr'
  | 'zcash_amt'
  | 'fi_doc'
  | 'nordext'
  | 'refer'
  | 'rdealer'
  | 'rportb'
  | 'xportb'
  | 'fo_remark'
  | 'mo_remark'
  | 'ndf_fo_rem'
  | 'ndf_mo_rem'
  | 'cruser'
  | 'dcrdat'
  | 'upuser'
  | 'dupdat'

export type ColumnDef = { label: string; type?: ColumnType }

/** An ALV layout variant (REUSE_ALV_VARIANT_F4 value help). */
export type LayoutVariant = { id: string; text: string; cols: ColumnKey[] }

export type SortDir = 'asc' | 'desc'
export type Sort = { field: ColumnKey | null; dir: SortDir }

export type PostingType = 'view' | 'post'
export type ActionName = 'preview' | 'pdf' | 'test' | 'post'

/** Status text and CSS class of a txn_status code. */
export type StatusMeta = { text: string; cls: string }

export type RunResultText = 'Posted' | 'Already posted' | 'Would be posted'
export type RunResultClass = 'res-ok' | 'res-info' | 'res-warn'
export type RunResult = {
  bukrs: string
  rfha: string
  keyDate: string
  result: RunResultText
  cls: RunResultClass
  fiDoc: string
}

/** What the posting-run modal shows. */
export type RunView = {
  title: string
  params: [string, string][]
  results: RunResult[]
  notes: string
}

/** The bank address block of the letter (go_obj_data->get_addr). */
export type BankAddress = {
  zdate: string
  zbank: string
  zaddr1: string
  zaddr2: string
  zaddr3: string
  zattn: string
  zvdate: string
}

export type LetterModel = {
  row: Deal
  company: string
  addr: BankAddress
  reg: string
  lines: string[]
}

/** One drawing operation of the minimal PDF writer: a text run or a horizontal rule. */
export type PdfItem =
  | { rule: true; y: number }
  | { rule?: false; t: string; y: number; bold?: boolean | undefined; size?: number | undefined; x?: number | undefined }

/** The calendar's displayed month (month is 0-based). */
export type CalendarView = { y: number; m: number }
export type CalendarCell = { iso: string; day: number; muted: boolean; selected: boolean; today: boolean }

export type ConfirmRequest = { kind: 'post'; row: Deal } | { kind: 'postAll'; keyDate: string; count: number }

export type Toast = { message: string; error: boolean; show: boolean }

/** A drop-down entry of the Transaction No / Layout value helps. */
export type DropdownItem = { value: string; primary: string; secondary?: string; selected: boolean }
