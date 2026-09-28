/** The Deal ID / transaction status codes the page knows (STATUS_META's keys). */
export type StatusCode = '01' | '02' | '03' | '07' | '30'

export type StatusMeta = { desc: string; cls: string }

/** One FX transaction (RFHA) assigned to the Deal ID — a row of the FX Deals table. */
export type Leg = {
  rfha: string
  dealType: string
  bpName: string
  bpCode: string
  dealDate: string
  valueDate: string
  desc: string
  bs1: 'Buy' | 'Sell'
  curr1: string
  amt1: number
  bs2: 'Buy' | 'Sell'
  curr2: string
  amt2: number
  rateVal: number
  rateLabel: string
  txnStatus: string
  fxPl: number
}

export type Deal = {
  dealId: string
  dealDesc: string
  trader: string
  traderName: string
  startDate: string
  endDate: string
  fxModel: string
  modelDesc: string
  entityString: string
  currString: string
  mcRef: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  bukrs: string
  status: string
  /** No invoice plan: the invoice and P&L cards are hidden. */
  noInv: boolean
  /** Short-straddle model: shows "Confirm & Save SS Deal ID". */
  ssDeal: boolean
  legs: readonly Leg[]
}

export type Invoice = {
  tradeRef: string
  invType: string
  exRate: number
  amt: number
  curr: string
  due: string
}

export type Premium = {
  dealValue: number
  dealCurr: string
  netPremium: number
  netPremiumCurr: string
  rbiRate: number
  rbiDate: string
  netPremiumFwd: number
  netPremiumFwdCurr: string
  netPremiumPerUsd: number
  strikeRate: number
  invoiceRate: number
}

export type Replacement = { rfha: string; label: string }

export type DmsDoc = { name: string; type: string }

/** Documents keyed by Deal ID. */
export type DmsDb = Readonly<Record<string, readonly DmsDoc[]>>

/** The FX Deals table's data-key columns. `mcRef` and `txnStatusDesc` are not leg fields. */
export type SortKey =
  | 'rfha'
  | 'dealType'
  | 'bpName'
  | 'dealDate'
  | 'valueDate'
  | 'bs1'
  | 'amt1'
  | 'bs2'
  | 'amt2'
  | 'rateVal'
  | 'mcRef'
  | 'txnStatusDesc'
  | 'fxPl'

export type Sort = { key: SortKey | null; dir: 1 | -1 }

export type ActionVisibility = {
  upd: boolean
  can: boolean
  dealEdit: boolean
  rev: boolean
  pre: boolean
  ref: boolean
  dms: boolean
  ssDeal: boolean
}

export type PlRow = {
  type: string
  famt: number
  lamt: number
  cls: '' | 'pl-total-row' | 'pl-pct-row'
  /** The "P&L Orign(%)" row prints both columns as percentages. */
  pct: boolean
}

/** Outcome of a mock service call; `deals` is the next deal list when it succeeded. */
export type ServiceResult = { ok: true; msg: string; deals: readonly Deal[] } | { ok: false; msg: string }

export type ToastType = 'success' | 'error' | 'info'
export type Toast = { id: number; msg: string; type: ToastType }

export type ModalId = 'changeConfirm' | 'editDeal' | 'premium' | 'cancelDeal' | 'reverse' | 'dms' | 'ssDeal'

/** The Edit Deal Pair popup's working state (the page's state.editDealDraft plus its controls). */
export type EditDraft = { oldRfha: string; editing: boolean; newRfha: string }
