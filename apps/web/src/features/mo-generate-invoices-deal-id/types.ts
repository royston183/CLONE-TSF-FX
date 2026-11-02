/** ZSGTSFTR_DEALID-ZDEAL_STAT, as ZSGTSFTR_DEAL_ST holds it ('04', '05', '07', …). */
export type DealStatus = string

/** One gt_top row: ZSGTSFCDS_FX / ZSGTSFCDS_OPTION for the Deal ID. */
export type FxRow = {
  dealType: string
  roll: string
  bukrs: string
  bp: string
  partner: string
  rfha: string
  start: string
  end: string
  entity: string
  pc1: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  pc2: string
  curr2: string
  amt2: number
  allIn: number
  strike: number
  /** Option premium (BZBETR) — 0 for forwards. */
  preAmt: number
  mc: string
  txn: string
  /** NDF_DATE (DD-MM-YYYY) / NDF_REF / NDF_RATE / ZCASH_AMT / CASH_CURR; '' when SAP does not serve them (never 0). */
  ndfDate?: string
  ndfRef?: string
  ndfRate?: number | ''
  cashAmt?: number | ''
  cashCurr?: string
}

/**
 * A ZSGTSFTR_BIL_ADJ-shaped record (column -> value): what gs_inv carries besides the grid's
 * own columns, so a MODIFY writes the row exactly as the ABAP's CORRESPONDING does.
 */
export type AdjRecord = Record<string, string | number | null>

/** One gt_inv row (the Adjusted Price / Qty grid). */
export type InvRow = {
  ttype: string
  invType: string
  seller: string
  buyer: string
  bp: string
  partnerBank: string
  houseBank: string
  accountId: string
  invDate: string
  dueDate: string
  commodity: string
  gtComm: string
  qty: number
  usdPrice: number
  rate: number
  price: number
  amt: number
  amtUsd: number
  planned: number
  invNo: string
  /** ZINV_REF, copied from INV_REF-ZINV_TRM_NO: the trade invoice reference, separate from ZINV_NO. */
  invTrmRef: string
  pc: string
  /** cinv_type is set (the BL already carries an invoice type): the row's cells are disabled. */
  locked: boolean
  /** ZCURR: the rate cell is editable only for a non-USD invoice (FORM enable_disable). */
  curr: string
  /** D1 / D2: the FX deal the trade type is linked to (RULE_BT zdN_inv_link). */
  dealType: string
  rec: AdjRecord
}

/** One ZSGTSFTR_BL / ZSGTSFTR_BL_RUSE row of the Deal ID (screen 9001). */
export type BlRow = {
  blNo: string
  blSplit: string
  blDate: string
  lot: string
  tfNo: string
  tfSplit: string
  vessel: string
  pol: string
  pod: string
  commodity: string
  qty: number
  status: string
  invType: string
  invDate: string
  reuse: string
  /** FORM enable_disable_bl: the Check box is disabled once the BL carries an invoice type. */
  locked: boolean
  remark?: string
}

/** One Invoice Difference row (gt_diff, FORM fetch_invoice_diff). */
export type DiffRow = {
  ttype: string
  finalAmt: number
  currency: string
  planned: number
  diff1: number
  dealType: string
  /** null when the deal's FX transactions cannot be read. */
  dealAmt: number | null
  diff2: number | null
}

export type Deal = {
  dealId: string
  dealRef: string
  mcRef: string
  mcDesc: string
  modelId: string
  modelDesc: string
  entityString: string
  currencyString: string
  trader: string
  traderDesc: string
  status: DealStatus
  fxInvModel: string
  dealStart: string
  dealEnd: string
  mcDate: string
  shipStart: string
  shipEnd: string
  dm: boolean
  /** ZSGTSFTR_TOLR ztol_id 'T02' (Trade Invoice); null when it could not be read. */
  tolerance: number | null
  fx: FxRow[]
  inv: InvRow[]
  bl: BlRow[]
  diff: DiffRow[]
  /** '' when the FX transactions were read; otherwise why not (shown in the grid's empty state). */
  fxReason: string
  /** '' when the Adjusted Price / Qty grid could be built; otherwise why not. */
  invReason: string
  /** '' when the BLs were read; otherwise why not. */
  blReason: string
  /** gv_reg and gv_val_flag: the Confirm Invoice profit-percent check. */
  region: string
  profitMaintained: boolean
}

/** One Deal ID in the P_DEAL value help / View Deals list. */
export type DealListRow = {
  dealId: string
  dealRef: string
  modelId: string
  entityString: string
  status: string
  statusLabel: string
  mcRef: string
  trader: string
}

export type Sort<K extends string = string> = { key: K; dir: 1 | -1 }

export type Toast = { id: number; message: string; kind: 'success' | 'error' | 'warn' | 'info' }

export type ConfirmDialogState = {
  title: string
  text: string
  note: string
  yesLabel: string
  onYes: () => void
}
