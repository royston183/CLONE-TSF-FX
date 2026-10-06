import type { FxRow } from '../../shared/fx/mw.ts'

/** The Deal ID / transaction status codes the badge has a colour for (STATUS_CLS's keys). */
export type StatusCode = '01' | '02' | '03' | '07' | '30'

export type StatusMeta = { desc: string; cls: string }

/** One FX transaction (RFHA) assigned to the Deal ID — a row of the FX Deals table (gt_top). */
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

/** Screen 9000's header (FORM screen_desc_fields) plus the flags the PF-STATUS and containers follow. */
export type Deal = {
  dealId: string
  dealDesc: string
  /** ZSGTSFTR_DEALID-ZTRD_CODE. */
  trader: string
  /** ZSGTRMTR_TRADER-ZTRADER (d~ztrader). */
  traderName: string
  startDate: string
  endDate: string
  /** gv_mod: the MC's model, else ZSGTSFTR_DEALID-ZTSF_MODEL when it is in ZSGTSFTR_RULE_BT. */
  fxModel: string
  modelDesc: string
  /** gv_ent: ZSGTSFTR_MAS_CON-ZENT_DESC. */
  entityString: string
  /** gv_curr: ZSGTSFTR_DEALID-ZDEAL_CURR_DESC. */
  currString: string
  /** gv_omc: ZSGTSFTR_MAS_CON-ZMC_REF_NO (blank when the Deal ID's MC is not found). */
  mcRef: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  /** The legs' company code (gs_top-bukrs); blank while the legs are not served. */
  bukrs: string
  status: string
  /** ZSGTSFTR_DEAL_ST-ZDEAL_SDESC, from the status list box as FORM drop_down builds it. */
  statusText: string
  /** gv_noinv (RULE_BT-ZNO_INV) or status 30: the invoice and P&L containers are hidden. */
  noInv: boolean
  /** Short-straddle model (RULE_BT-ZSS): shows "Confirm & Save SS Deal ID". */
  ssDeal: boolean
  /** The user is in TVARVC ZSGTSF_UNWIND, so REV is not excluded. */
  unwind: boolean
  legs: readonly Leg[]
}

/** A quick pick / datalist entry: one ZSGTSFTR_DEALID row. */
export type DealPick = { dealId: string; status: string; statusText: string }

/** One planned trade invoice (gt_inv / ZSGTSFTR_INV_REF). */
export type Invoice = {
  tradeRef: string
  invType: string
  exRate: number
  amt: number
  invAmt: number
  curr: string
  due: string
}

/** One entry of the MC Ref No help (MODULE f4_help). */
export type McHelp = { ref: string; desc: string }

/** Everything the screen shows for one loaded Deal ID. */
export type DealScreen = {
  deal: Deal
  /** The ZSGTSFTR_DEALID rows read for the Deal ID (the key of the Cancel write). */
  rows: readonly FxRow[]
  /** Why the FX Deals table is empty (the legs' view is not served); null when it is served. */
  legsWaiting: string | null
  /** The planned trade invoices, or null with `invoiceWaiting` saying why they cannot be built. */
  invoices: readonly Invoice[] | null
  invoiceWaiting: string | null
  /** The Planned P&L is always gated while the legs are not served. */
  plWaiting: string
  mcHelp: readonly McHelp[]
  /** Why the Edit Deal Pair replacement help is empty. */
  replacementWaiting: string
}

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

export type ToastType = 'success' | 'error' | 'info'
export type Toast = { id: number; msg: string; type: ToastType }

export type ModalId = 'changeConfirm' | 'editDeal' | 'premium' | 'cancelDeal' | 'reverse' | 'dms' | 'ssDeal'

/** The Edit Deal Pair popup's working state (the page's state.editDealDraft plus its controls). */
export type EditDraft = { oldRfha: string; editing: boolean; newRfha: string }
