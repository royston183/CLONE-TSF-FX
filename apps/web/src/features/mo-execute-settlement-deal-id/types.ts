export type StatusMeta = { code: string; text: string; cls: string }

export type Deal = {
  dealId: string
  dealStartDate: string
  dealEndDate: string
  revisedEndDate: string
  mcRefNo: string
  mcDesc: string
  mcDate: string
  shipEndDate: string
  fxModelId: string
  fxModelDesc: string
  entityString: string
  fxInvModel: string
  trader: string
  traderDesc: string
  currencyString: string
  dealStatus: string
  noInvoiceFlag: boolean
}

export type FxDeal = {
  seq: string
  dealType: string
  dealTypeChip: string
  rfha: string
  /** BUKRS of the leg (ZSGTSFCDS_FX). */
  bukrs: string
  bp: string
  txnDate: string
  valDate: string
  entity: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  spot: string
  rate: string
  mcRefNo: string
  status: string
  statusChip: string
  doc1: string
  doc2: string
}

export type TradeInvoice = {
  leg: string
  trfDesc: string
  docType: string
  xblnr: string
  drPost: string
  crPost: string
  dueDate: string
  postDate: string
  invAmt: number
  curr: string
  payAmt: number
  recPay: string
  trfType: string
  fiDoc: string
  setCo: boolean
}

export type Headsup = { date: string; cat: string; msg: string }
export type DmsDoc = { type: string; file: string; date: string; by: string }

export type ToastKind = 'info' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind | null; visible: boolean }

/** A row of a grid together with its index in the full (unfiltered) list. */
export type Indexed<T> = { row: T; idx: number }

export type ModalId =
  | 'amend'
  | 'headsup'
  | 'diff'
  | 'dms'
  | 'editDms'
  | 'pl'
  | 'fxPost'
  | 'invPost'
  | 'letter'
  | 'viewInv'

export type FxPostForm = {
  bukrs: string
  rfha: string
  dealType: string
  partner: string
  bAmt: string
  bDoc: string
  bBankType: string
  bTrfType: string
  bBankId: string
  bAcc: string
  subNo: boolean
  sAmt: string
  sDoc: string
  sBankType: string
  sTrfType: string
  sBankId: string
  sAcc: string
  remit: boolean
}

export type InvPostForm = {
  date: string
  bank: string
  sender: string
  receiver: string
  amt: string
  fiDoc: string
  docMsg: string
}

export type FxPostDefaults = Pick<
  FxPostForm,
  'bukrs' | 'rfha' | 'dealType' | 'partner' | 'bAmt' | 'sAmt' | 'bDoc' | 'sDoc'
>

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
