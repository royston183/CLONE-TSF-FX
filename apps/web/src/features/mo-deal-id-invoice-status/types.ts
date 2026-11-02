/** ZSGTSFTR_DEAL_ST's ZDEAL_STAT. */
export type DealStatusCode = string

/** One row of FORM get_data's GT_DATA: a Deal ID and its FX/invoice linkage. */
export type DealRow = {
  dealId: string
  dealDesc: string
  mcRef: string
  /** ISO yyyy-mm-dd. */
  startDate: string
  endDate: string
  rfha1: string
  rfha2: string
  rfha3: string
  rfha4: string
  rfha5: string
  dealStatus: DealStatusCode
  dealStatusDesc: string
  origin: string
  modelId: string
  region: string
  modelDesc: string
  /** D1(USD): FX legs from TrmFxApp + FxTransaction (option legs have no service); null when those cannot be read. */
  utiAmt: number | null
  invStatus: string
  t1Amt: number | null
  bukrs1: string
  bukrs2: string
  /** The Deal ID Analysis header: the Deal ID's own and its Master Contract's fields. */
  trader: string
  mcDesc: string
  /** ISO yyyy-mm-dd, '' when the MC has none. */
  mcDate: string
  shipStart: string
  shipEnd: string
  entityString: string
  currencyString: string
}

export type CodeDesc = { id: string; desc: string }

export type SortKey = 'dealId' | 'dealDesc' | 'mcRef' | 'startDate' | 'endDate' | 'dealStatus' | 'dealStatusDesc' | 'origin' | 'modelId' | 'region' | 'modelDesc' | 'utiAmt' | 'invStatus' | 't1Amt'
export type Sort = { key: SortKey | null; dir: 1 | -1 }

export type Filters = {
  search: string
  origin: string
  region: string
  model: string
  keyDate: string
}

/** One FX Deal (D1/D2/...) leg shown in the Deal ID Analysis "FX Deals" grid. */
export type FxRow = {
  type: string
  entity: string
  bukrs: string
  partner: string
  rfha: string
  product: string
  txn: string
  start: string
  end: string
  bs1: string
  curr1: string
  amt1: string
  bs2: string
  curr2: string
  amt2: string
  rate: string
  status: string
  /** NDF columns, display text; blank when SAP does not serve them. The grid has no rows until the Deal ID Analysis reads exist. */
  ndfDate?: string
  ndfRef?: string
  ndfRate?: string
  cashAmt?: string
  cashCurr?: string
}

/** One planned Trade Invoice leg (T1/T2). */
export type InvoiceRow = {
  ttype: string
  dtype: string
  sell: string
  buy: string
  curr: string
  amt: string
  ex: string
  inv: string
  ref: string
}

/** One row of the "Planned P&L" table. */
export type PlRow = {
  type: string
  f1: string
  l1: string
  f2: string
  l2: string
}

export type Trader = { code: string; desc: string }

/** Which generic popup (mirrors the legacy's single #modalOverlay, swapped per action) is open. */
export type ModalState =
  | { kind: 'invoice'; row: DealRow }
  | { kind: 'change'; row: DealRow }
  | { kind: 'premium'; row: DealRow }
  | { kind: 'editPair'; row: DealRow }
  | { kind: 'cancel'; row: DealRow }
  | { kind: 'info'; title: string; message: string }
  | { kind: 'dms'; row: DealRow }
  | null

export type DmsDocState = { fileName: string; filePath: string; fileSize: number; dmsCode: string; comment: string }
