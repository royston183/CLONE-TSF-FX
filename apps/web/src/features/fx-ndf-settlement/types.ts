/** One T001 company code of the S_BUKRS value help (API_COMPANYCODE_SRV / A_CompanyCode). */
export type CompanyOption = { code: string; name: string }

/** One deal of GET_DATA's list (see api.ts dealFromRecord). Field names keep the SAP names the report uses. */
export type Deal = {
  bukrs: string
  rfha: string
  /** Part of the view's row key (BUKRS + RFHA + REFNR); not shown. */
  refnr: string
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
  /** VTBFHA buy/sell indicator as SAP holds it (BS_1 / BS_2 carry the texts). */
  bs: string
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
  /** BKPF-BELNR of the settlement (FxTransaction.AccountingDocument; empty when not posted). */
  fi_doc: string
  /** Fiscal year of the matched FI document (empty when none). */
  fi_gjahr?: string
  /** Whether SAP serves NDF_RATE / ZCASH_AMT / CASH_CURR (FxTransaction settlement fields); if not, they show blank. */
  settlement_known: boolean
  /** Whether SAP serves the FI document (FxTransaction.AccountingDocument). */
  fi_known: boolean
  /** TrmFxApp's ETag: the status-50 write sends it back as If-Match. */
  etag: string
}

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

export type RunResultText = 'Posted' | 'Already posted' | 'Would be posted' | 'Refused'
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
  /** Why the address block is empty (no Z002 address, or the read failed); '' when it is filled. */
  addrNote: string
  reg: string
  lines: string[]
}

/** The calendar's displayed month (month is 0-based). */
export type CalendarView = { y: number; m: number }
export type CalendarCell = { iso: string; day: number; muted: boolean; selected: boolean; today: boolean }

export type ConfirmRequest = { kind: 'post'; row: Deal } | { kind: 'postAll'; keyDate: string; count: number }

export type Toast = { message: string; error: boolean; show: boolean }

/** A drop-down entry of the Transaction No / Layout value helps. */
export type DropdownItem = { value: string; primary: string; secondary?: string; selected: boolean }

/** Where a list stands: loaded from SAP, still loading, or not readable (with the reason the screen shows). */
export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ok'; value: T }
  | { state: 'waiting' | 'error'; reason: string }
