import type { NdfExtras } from '../../shared/fx/ndf-columns.ts'

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
  /** ZSGTSFTR_DEALID key parts, needed to write ZDEAL_STAT back. */
  dealType?: string
  subType?: string
}

export type FxDeal = {
  seq: string
  dealType: string
  dealTypeChip: string
  rfha: string
  /** BUKRS of the leg (ZSGTSFCDS_FX). */
  bukrs: string
  /** The transaction type (VTBFHA SFHAART, 619 forward, 631 NDF ...): the FX-Invoice Difference leaves 619 to the invoice rows. */
  txnType?: string
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
  /**
   * Settlement Complete (Execution) of the transaction: VTBFHA ZTSF_EXE_CO, as TrmFxApp serves it (ZtsfExeCo). It is
   * what ZSGTSF_RDEAL_TRD_INV reads as gt_top-set_co. Absent on rows built without TrmFxApp.
   */
  settled?: boolean
  /** ZSGTSFTR_SET_FX ZDSS_DEAL of the leg's deal type: the DSS deal type settled together with it. */
  dssDeal?: string
  /** TXN_STATUS code (gt_top-txn_status): 03, 07, 10 ... */
  txnStatus?: string
  /** Partner Name (gt_top-bp_name, A_BusinessPartner BusinessPartnerFullName). */
  bpName?: string
  /** Transaction Type Desc (gt_top-xtext, trmmaster TransactionTypeName). */
  txnTypeDesc?: string
  /** ZROLL_DEAL_TYPE: R<n>-D1 / C<n>-D2 ... (rollover numbering of PBO). */
  rollType?: string
  /** RBUSA / PRCTR, when FxTransaction serves them. */
  busArea?: string
  profitCenter?: string
  /** PC1 / PC2 / STRIKE: option fields; no service serves them for the FX legs yet. */
  putCall1?: string
  putCall2?: string
  strike?: string
  /** The transaction's TSF bank fields (VTBFHA ZTSF_*), as TrmFxApp serves them. */
  tsf?: FxTsf
  /** NDF_DATE / NDF_REF / NDF_RATE / ZCASH_AMT / CASH_CURR; blank when SAP does not serve them. */
  ndf?: NdfExtras
  /** ZSGTSFTR_SET_FX of the leg's deal type: its buy (ZBS 'B') and sell (ZBS 'S') rows. */
  setFxBuy?: SetFxSide
  setFxSell?: SetFxSide
}

/** VTBFHA's TSF custom fields (structure ZZAPST_TSF), through TrmFxApp. */
export type FxTsf = {
  bhbkid: string
  bhktid: string
  shbkid: string
  shktid: string
  bpayid: string
  spayid: string
  rbukrs: string
  rpayid: string
  pbukrs: string
  ppayid: string
}

/** One ZSGTSFTR_SET_FX row (deal type + buy / sell side) of the model. */
export type SetFxSide = {
  seq: string
  dssDeal: string
  curr: string
  /** ZACC: 01 Bank Account, 02 Bank BP, 04 Bank Clearing. */
  acc: string
  /** ZTRF_TYPE: 01 TT Form, 02 ECM, 03 Letter, 04 Indirect, 05 SSI Letter + ECM, 06 SSI Letter. */
  trfType: string
  rbukrs: string
  payId: string
  bankId: string
  letCode: string
  letName: string
  /** ZSGTSFTR_SET_FX ZSET_DESC, the side's settlement description (blank when the table does not carry it). */
  desc?: string
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
  /** Why payAmt could not be worked out (no mapped FX deal / rate for a cross-currency leg); blank when it could. */
  payReason?: string
  recPay: string
  trfType: string
  fiDoc: string
  setCo: boolean
  /** From ZSGTSFTR_SET_TYP: its sequence (the TRD_POS key), company, D-map, settlement currency, FI Posting flag. */
  seq?: string
  setCurr?: string
  bukrs?: string
  dMap?: string
  postRequired?: boolean
  /** SET_TYP configuration copied into TRD_POS by Initiate: Settlement (ZSET_CHECK), DSS deal, set type, posting type. */
  setCheck?: boolean
  dssDeal?: string
  setType?: string
  fiType?: string
  postDesc?: string
  /** SET_TYP ZBUY / ZSELL: the buyer pays (Sender / Payer), the seller receives (Receiver / Payee). */
  buy?: string
  sell?: string
  /** ZSGTSFTR_TRD_POS ZHBKID / ZHKTID (Sender / Payer) and ZREC_HBKID / ZREC_HKTID (Receiver / Payee). */
  senderHouseBank?: string
  senderAccountId?: string
  receiverHouseBank?: string
  receiverAccountId?: string
  /** BIL_ADJ ZPTNR_BKID / ZBP: the Partner Bank assigned to the leg's invoice in Generate Invoices (display only). */
  partnerBank?: string
  businessPartner?: string
}

/** A fixture row of the legacy DMS list (tests only; the live panel is shared/fx/DealDmsModal.tsx). */
export type DmsDoc = { type: string; file: string; date: string; by: string }

export type Headsup = {
  entity: string
  tradeType: string
  currency: string
  dealAmount: number
  finalAmount: number
  difference: number
  action: string
}

export type ToastKind = 'info' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind | null; visible: boolean }

/** A row of a grid together with its index in the full (unfiltered) list. */
export type Indexed<T> = { row: T; idx: number }

export type ModalId =
  | 'amend'
  | 'headsup'
  | 'diff'
  | 'dms'
  | 'pl'
  | 'fxPost'
  | 'invPost'
  | 'letter'
  | 'viewInv'

export type FxPostForm = {
  /** Sequence of the leg in the settlement (ZSGTSFTR_SET_FX ZSEQ). */
  seq: string
  /** Settlement Desc of the buy / sell side. */
  bSetDesc: string
  sSetDesc: string
  /** Sell side Letter Code (SET_FX sell row). */
  sLetterCode: string
  bukrs: string
  rfha: string
  dealType: string
  partner: string
  bAmt: string
  bDoc: string
  bBankType: string
  bTrfType: string
  /** Rec Co Code (ZTSF_RBUKRS), Receiving Bank ID (ZTSF_BPAYID), Payment ID (ZTSF_RPAYID): maintainable. */
  bRecCoCode: string
  bBankId: string
  bPaymentId: string
  /** House bank / Account ID (ZTSF_BHBKID / ZTSF_BHKTID): manually selected for the receiving company. */
  bHouseBank: string
  bAccountId: string
  letterCode: string
  letterName: string
  subNo: boolean
  sAmt: string
  sDoc: string
  sBankType: string
  sTrfType: string
  /** Paying Bank ID (ZTSF_SPAYID), Pay Co Code (ZTSF_PBUKRS), Payment ID (ZTSF_PPAYID): maintainable. */
  sBankId: string
  sPayCoCode: string
  sPaymentId: string
  /** House bank / Account ID (ZTSF_SHBKID / ZTSF_SHKTID): manually selected for the paying company. */
  sHouseBank: string
  sAccountId: string
  remit: boolean
}

export type InvPostForm = {
  /** Basic Details of screen 9002. */
  bukrs: string
  seq: string
  recPay: string
  tradeType: string
  setDesc: string
  payAmt: string
  linkedFx: string
  settled: boolean
  trfType: string
  postingType: string
  fiPosting: boolean
  partnerId: string
  date: string
  sender: string
  senderHouseBank: string
  senderAccountId: string
  receiver: string
  receiverHouseBank: string
  receiverAccountId: string
  amt: string
  fiDoc: string
  docMsg: string
}

export type FxPostDefaults = Pick<
  FxPostForm,
  Exclude<keyof FxPostForm, 'subNo' | 'remit'>
>

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
