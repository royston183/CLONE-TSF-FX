import type { NdfExtras } from '../../shared/fx/ndf-columns.ts'

export type FxLeg = {
  type: 'D1' | 'D2'
  bukrs: string
  rfha: string
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  bp: string
  bpName: string
  rate: number
  /** NDF_DATE / NDF_REF / NDF_RATE / ZCASH_AMT / CASH_CURR; blank when SAP does not serve them. */
  ndf?: NdfExtras
}

export type InvoiceLeg = {
  ttype: 'T1' | 'T2' | 'T3'
  ref: string
  seller: string
  buyer: string
  qty: number
  usdPrice: number
  dueDate: string
  invDate: string
  invNo: string
  marked: boolean
  invoiced: boolean
  hb: string
  acct: string
  ptnr: string
}

export type BillOfLading = {
  blNo: string
  vessel: string
  loadPort: string
  dischargePort: string
  shipDate: string
  qty: number
  status: string
}

/** ZSGTSFTR_DEAL_ST's ZDEAL_STAT; the invoicing workflow runs 03 -> 04 -> 05 / 07. */
export type DealStatus = string

/** One Deal ID booked against one Master Contract — ZSGTSF_RBILL_ADJUST's unit of work. */
export type Deal = {
  dealId: string
  dealDesc: string
  mcRef: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  model: string
  commodity: string
  trader: string
  dealStart: string
  dealEnd: string
  dealStat: DealStatus
  /** The MC's origin entity (ZSGTSFTR_MAS_CON-ZORIGIN); seed deals leave it to the model's entity string. */
  origin?: string
  /** The origin's region (ZSGTSFTR_COMP-ZREG_ID); seed deals leave it to the model. */
  region?: string
  mcAmtUsd: number
  /** ZTOT_AMT_INV: the T1 ZSGTSFTR_BIL_ADJ ZAMT_USD the report sums; fixtures leave it to the legs. */
  totInvUsd?: number
  /** ZSGTSFCDS_FX_N / _OPTION_N legs; empty while those views are not served (WAITING FOR API). */
  fx: FxLeg[]
  inv: InvoiceLeg[]
  bls: BillOfLading[]
}

export type Entity = { code: string; cocode: string; name: string }
export type FxModel = { code: string; desc: string; entities: string[]; curr: string[]; region: string }

export type SortKey = 'dealId' | 'dealStart' | 'dealEnd' | 'mcAmtUsd'
export type Sort = { key: SortKey | null; dir: 1 | -1 }

export type Filters = {
  q: string
  dateFrom: string
  dateTo: string
  region: string
  origin: string
  model: string
  status: string
}

export type ToastKind = '' | 'success' | 'warn' | 'error'
export type Toast = { id: number; message: string; kind: ToastKind }

/** Which of the rbill blotter's sub-modals (if any) is open. */
export type SubModal =
  | { kind: 'mc'; dealId: string }
  | { kind: 'bl' }
  | { kind: 'remark' }
  | { kind: 'compliance'; fullMatch: boolean; note: string }
  | { kind: 'diff' }
  | { kind: 'houseBank'; legIdx: number }
  | { kind: 'confirm'; title: string; text: string; yesLabel: string; onYes: () => void }
  | null
