import type { NdfExtras } from '../../shared/fx/ndf-columns.ts'

export type DealStatusCode = '02' | '03' | '05'

/** One row of FORM get_data's GT_DATA: a Deal ID eligible for manual invoice marking. */
export type DealRow = {
  dealId: string
  dealDesc: string
  mcRef: string
  commodity: string
  /** DD-MM-YYYY. */
  dealStart: string
  dealEnd: string
  status: string
  statusDesc: string
  origin: string
  model: string
  region: string
  modelDesc: string
  /** UTI_AMT (ZSGTSFCDS_FX / _OPTION); null while those views are not served (WAITING FOR API). */
  amount: number | null
  shipStart: string
  shipEnd: string
  /** The View Deal ID header: the Deal ID's trader and its MC's fields. */
  trader: string
  mcDesc: string
  mcDate: string
  entityString: string
  currencyString: string
  manualMarked: boolean
  // Derived by enrichRow.
  earliestStart: string
  daysShip: number
  daysEnd: number
  daysStart: number
}

export type SortKey = 'dealId' | 'dealDesc' | 'mcRef' | 'commodity' | 'dealStart' | 'dealEnd' | 'earliestStart' | 'status' | 'statusDesc' | 'origin' | 'model' | 'region' | 'modelDesc' | 'amount' | 'shipStart' | 'shipEnd' | 'daysShip' | 'daysEnd' | 'daysStart'
export type Sort = { key: SortKey; dir: 1 | -1 }

export type Filters = { search: string; dateFrom: string; dateTo: string; origin: string; region: string; model: string }

export type FxRow = {
  bukrs: string
  dealType: string
  rfha: string
  start: string
  end: string
  text: string
  entity: string
  side1: string
  curr1: string
  amt1: number
  side2: string
  curr2: string
  amt2: number
  spot: number | ''
  swap: number | ''
  allIn: number | ''
  strike: number | ''
  mcRef: string
  txnStatus: string
  premium: number | ''
  premiumCurr: string
  /** NDF columns; blank when SAP does not serve them. */
  ndf?: NdfExtras
}

export type InvoiceRow = {
  ref: string
  tradeType: string
  dealType: string
  sell: string
  buy: string
  curr: string
  mcPrimary: string
  mcSecondary: string
  usdAmount: number
  localAmount: number
  exchangeRate: number
}

export type AdjustedInvoiceRow = InvoiceRow & {
  ttype: string
  invType: string
  commodity: string
  qty: number
  usdPrice: number
  rate: number
  invDate: string
  dueDate: string
  finalInv: number
  invUsd: number
  planned: number
  partnerBank: string
}

export type PlannedPlRow = { type: string; usd: number; local: number; total?: boolean }

export type BlRow = {
  tfNo: string
  tfSplit: string
  blNo: string
  blSplit: string
  blDate: string
  commodity: string
  commodityId: string
  incoterm: string
  invoiceDate: string
  qty: number
  unit: string
  price: number
  tradeValue: number
}

export type SettlementRow = {
  seq: number
  transfer: string
  linked: string
  receipt: string
  invAmt: number
  invCurr: string
  payAmt: number
  payCurr: string
  fiDoc: string
  docMsg: string
  settlement: boolean
  posting: boolean
}

export type ViewDealData = {
  companyCode: string
  dealRef: string
  mcDate: string
  mcDesc: string
  entityString: string
  currencyString: string
  traderCode: string
  traderDesc: string
  statusText: string
  fxRows: FxRow[]
  invoiceRows: InvoiceRow[]
}

/** The main "View Deal ID" popup (mirrors the legacy's #detailOverlay, MC or the deal workspace). */
export type DetailModalState = { kind: 'mc'; row: DealRow } | { kind: 'deal'; row: DealRow } | null

/** One of the three fullscreen-ish workflow modals opened from the deal workspace. */
export type WorkflowKind = 'plannedPnl' | 'invoicing' | 'settlement'
export type WorkflowState = { kind: WorkflowKind; row: DealRow } | null

/** The small popup stacked on top of everything (mirrors the legacy's #subOverlay in its
 * "small" variant): BL list from the deal workspace, or a Treasury Transaction display. */
export type SubModalState = { kind: 'bl'; row: DealRow } | { kind: 'txn'; row: DealRow; fx: FxRow } | null

/** What a workflow's collapsible "extra" panel currently shows. */
export type WorkflowExtra =
  | { kind: 'change'; row: DealRow }
  | { kind: 'premium'; row: DealRow }
  | { kind: 'txn'; row: DealRow; fx: FxRow }
  | { kind: 'bl'; row: DealRow }
  | { kind: 'diff'; row: DealRow }
  | { kind: 'plannedInvoice'; row: DealRow }
  | { kind: 'settlementPl'; row: DealRow }
  | { kind: 'amendEnd'; row: DealRow }
  | null

export type ToastKind = '' | 'info' | 'warn' | 'error' | 'success'
export type Toast = { id: number; message: string; kind: ToastKind }
