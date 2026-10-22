export type StatusMeta = { label: string; css: string }

export type MasterContract = {
  ref: string
  desc: string
  origin: string
  date: string
  amt: number
  curr: string
  entstr: string
  /** The MC's FX model and currency string; the seed contracts leave them out. */
  model?: string
  currStr?: string
}

/** One FX deal leg (the top table). Field names are the legacy page's (ABAP) ones. */
export type TopRow = {
  /** '' until the leg is matched; the page's service sets 'C500' after a deal pair update. */
  color: string
  premCurr: string
  bukrs: string
  dealType: string
  bpName: string
  kontrh: string
  rfha: string
  sfhaart: string
  dblfz: string
  delfz: string
  xtext: string
  entity: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  ospot: number
  oswap: number
  /** '' when the leg has no all-in rate (options). */
  otot_rate: number | ''
  /** '' when the leg has no strike (forwards/swaps). */
  strike: number | ''
  mcRefNo: string
  /** TXN_STATUS of the leg; '' when the source does not carry it (ZSGTSFV_FX has no TXN_STATUS yet). */
  txnStatus: string
  /**
   * NDF fields (NDF_DATE / NDF_REF / NDF_RATE / ZCASH_AMT / CASH_CURR). '' when the source does not serve them
   * (blank, never 0): the view gives the date and reference, FxTransaction the rate and cash settlement once served.
   */
  ndfDate?: string
  ndfRef?: string
  ndfRate?: number | ''
  cashAmt?: number | ''
  cashCurr?: string
}

/** One planned trade invoice leg. */
export type InvoiceLine = {
  zttype: string
  sell: string
  buy: string
  curr: string
  trmNo: string
  amt: number
  exRate: number
  invAmt: number
}

export type Deal = {
  dealId: string
  dealRef: string
  status: string
  sDate: string
  eDate: string
  trdCode: string
  trdDesc: string
  mcRef: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  modId: string
  modDesc: string
  entStr: string
  currStr: string
  top: TopRow[]
  inv: InvoiceLine[]
}

/** The page's stand-in for the deal table: Deal ID → deal. */
export type DealStore = Record<string, Deal>

export type Premium = {
  dAmt: number
  dCurr: string
  lNet: number
  lCurr: string
  rbi: number
  rbiDate: string
  fNet: number
  fCurr: string
  pNet: number
  sRate: number
  iRate: number
}

export type PickedMc = { ref: string; desc: string }

/** A label/value pair for the read-only field grids. */
export type Field = readonly [label: string, value: string]

export type PlCell = { value: number; text: string; negative: boolean }
export type PlRow = { label: string; cells: PlCell[] }
export type PlTable =
  | { empty: true }
  | { empty: false; headers: string[]; rows: PlRow[]; totals: PlCell[]; count: number }

export type Toast = { id: number; message: string; isErr: boolean }
