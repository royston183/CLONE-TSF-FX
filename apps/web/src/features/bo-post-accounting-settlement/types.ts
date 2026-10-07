/**
 * ZSGTSFTR_DEALID-ZDEAL_STAT as a number, for the toolbar thresholds (20 Settlement Initiated,
 * 22 Settlement Completed - Accounting, as ZSGTSFTR_DEAL_ST holds them).
 */
export type DealStatus = number

/** One FX deal leg (D1/D2) in the "FX Deal Settlement" grid. */
export type FxLeg = {
  entity: string
  dealType: string
  /** Treasury transaction number (RFHA). */
  rfha: string
  buyCurr: string
  buyAmt: number
  sellCurr: string
  sellAmt: number
  rate: number
  status: 'Confirmed' | 'Posted'
  doc1: string
  doc2: string
  dssDeal: string
  sgsart: string
}

/** One trade invoice leg (T1/T2/T3) in the "Trade Invoice Settlement" grid. */
export type InvLeg = {
  tType: string
  tradeType: string
  setDesc: string
  /** The FX deal this invoice leg is mapped to; empty for an external leg. */
  dMap: string
  dssDeal: string
  trfType: string
  invAmt: number
  invCurr: string
  payAmt: number
  payCurr: string
  preAmt: number
  postCheck: boolean
  setCheck: boolean
  fiDoc: string
  docMsg: string
  buy: string
  sell: string
}

export type Deal = {
  dealId: string
  dealRef: string
  dealStartDate: string
  dealEndDate: string
  mcRefNo: string
  mcDesc: string
  mcDate: string
  shipEndDate: string
  fxModelId: string
  modelDesc: string
  entityString: string
  currencyString: string
  fxInvModel: string
  traderCode: string
  traderDesc: string
  status: DealStatus
  /** ZDEAL_STAT as stored ('02', '20', …) and its ZSGTSFTR_DEAL_ST text. */
  statusCode: string
  statusText: string
  /** What the FX Deal grid still lacks, or why it is empty (WAITING FOR API); absent in fixtures. */
  fxWaiting?: string
  invWaiting?: string
  top: FxLeg[]
  inv: InvLeg[]
}

export type ToastKind = '' | 'error' | 'success'
export type ToastMessage = { message: string; kind: ToastKind }

/** Result of a state-changing rule: the (possibly unchanged) deal and what to tell the user. */
export type Outcome = { deal: Deal; toast: ToastMessage }

export type DragKind = 'fx' | 'inv'
export type DragState = { kind: DragKind; idx: number }

export type StatusInfo = { cls: 'st-confirmed' | 'st-initiated' | 'st-complete'; label: string }

export type ToolbarState = {
  postFxDisabled: boolean
  postInvDisabled: boolean
  accountingDisabled: boolean
  showInitiate: boolean
}

export type DetailCell = { label: string; value: string; cls: string }

/** What the document-preview popup is showing. */
export type DocPreview =
  | { kind: 'TXN'; docNo: string; entity: string }
  | { kind: 'FI'; docNo: string; entity: string }
  | { kind: 'REPORT' }

export type ActiveModal = 'txn' | 'posting' | 'pall' | 'doc' | null

export type DropDecision = { run: 'none' } | { run: 'error'; message: string } | { run: 'fx' | 'inv' }
