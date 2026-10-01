/** A Deal ID row (ZSGTSFTR_DEALID joined to its master contract). Dates are ISO yyyy-mm-dd. */
export type Deal = {
  id: string
  type: string
  subType: string
  desc: string
  model: string
  /** ZSGTSFTR_DEAL_ST code. */
  status: string
  ss: 'X' | ''
  origin: string
  mcRef: string
  mcDate: string
  mcAmt: number
  /** ZSGTSFTR_MAS_CON-ZCURR: the currency of mcAmt. */
  mcAmtCurr: string
  start: string
  end: string
  trader: string
  region: string
  dealRef: string
  fxInvModel: string
  pl: number
  plCurr: string
  plRate: number
  plLocal: number
  plLCurr: string
  mcCurr: string
  dealCurr: string
}

/** One FX / option transaction of a deal (ZSGTSFCDS_FX + ZSGTSFCDS_OPTION, unified like gt_txn). */
export type Txn = {
  dealId: string
  rfha: string
  bukrs: string
  /** Transaction type: 604/605/609 spot, 619 forward, 631/632 (D)NDF, 643–648 options. */
  sfhaart: string
  /** Product type: 12x FX, 14x option. */
  sgsart: string
  dealType: string
  cpty: string
  cptyName: string
  grp: string
  entity: string
  tradeDate: string
  valueDate: string
  eDate: string
  xtext: string
  pc1: string
  pc2: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  ospot: number
  oswap: number
  rate: number
  strike: number
  /** VTBFHA txn_status. */
  status: string
  /** '1' physical delivery, '2' cash settlement. */
  settlfl: string
  preAmt: number
  preCurr: string
  mcRef: string
  ndfDate: string
  ndfRef: string
  ndfRefName: string
  ndfRate: number
  cpair: string
  cashAmt: number
  cashCurr: string
  coverTxn: string
  portfolio: string
  seq: number
}

/** An invoice-difference / settlement-spot record (ZSGTSFTR_IN_SPOT). */
export type InSpot = {
  dealId: string
  dealType: string
  /** ZRFHA: the transaction the record was settled against; blank while no spot exists. */
  rfha: string
  dssType: string
  fAmt: number
  fxAmt: number
  curr: string
  dAmt: number
  bs: string
  spotTxn: string
  spotCreate: 'X' | ''
  expiry: string
  bukrs: string
  entity: string
}

export type AppData = { deals: Deal[]; txns: Txn[]; inSpot: InSpot[]; nextRfha: number }

/** A transaction as the deal popup lists it, with the settlement-spot columns (FETCH_TXN_DATA). */
export type TxnRow = Txn & { sdAmt: number | ''; sdCurr: string; sdPending: boolean; sdDone: boolean }

/** An Action Items row (PROCESS_ACTION_ITEMS + COLOR_CODE_ACTION_ITEMS). */
export type ActionItem = {
  rfha: string
  bukrs: string
  dealType: string
  cpty: string
  sfhaart: string
  valueDate: string
  eDate: string
  status: string
  curr1: string
  amt1: number
  curr2: string
  pc1: string
  bs1: string
  coverTxn: string
  text: string
  textCode: string
  bs: string
  invAmt: number | ''
  invCurr: string
  diffAmt: number | ''
  button: boolean
  state: '' | 'done' | 'pending'
}

/** Filters in the toolbar. Dates are dd-mm-yyyy as typed. */
export type Filters = { from: string; to: string; model: string; deal: string; status: string }

export type SortDir = 'asc' | 'desc'
export type Sort = { field: string; dir: SortDir }

export type StatusInfo = { code?: string; desc: string; cls: string }

export type ToastKind = '' | 'error' | 'success'
export type Toast = { msg: string; kind: ToastKind; id: number }

/** The values a Create Spot popup works on. base 1: amount 1 is fixed; base 2: amount 2 is. */
export type SpotDraft = {
  bukrs: string
  curr1: string
  bs1: string
  amt1: number
  curr2: string
  bs2: string
  amt2: number
  rate: number
  bp: string
  invText1: string
  invText2: string
  base: 1 | 2
}

/** Where a popup was opened from: an Action Items "Create" button or the toolbar. */
export type ActionCtx = { dealId: string; rfha: string; fromAction: boolean }

export type SpotVariant = 'ndo' | 'ndf' | 'dndf'

/**
 * The masters the workbench reads (ZSGTSFTR_COMP, _RULE_BT, _DEAL_ST, _TRDWAI, _SS_SPOT,
 * ZSGTRMTR_BP_GRP x _BPEXT, TCURR, TCURF). Filled by api.ts; the tests fill them from fixtures.
 */
export type Lookups = {
  companies: { code: string; name: string; entity: string }[]
  models: { id: string; desc: string }[]
  /** DEAL_ST at sub type FX1; closed = a settlement-completed status (KPIs only). */
  dealStatus: { code: string; desc: string; cls: string; closed: boolean }[]
  /** txn_status -> text (ZSGTSFCDS_FX / _OPTION ext_stat_desc). */
  txnStatus: Record<string, { desc: string; cls: string }>
  /** sfhaart -> text (ZSGTSFCDS_FX / _OPTION xtext). */
  txnTypes: Record<string, string>
  bps: { bp: string; name: string; grp: string }[]
  actionTexts: { sf: string; code: string; text: string }[]
  /** ZMOD_ID -> ZSUB_TYPE (first RULE_BT row of the model). */
  ruleBt: Record<string, string>
  /** TCURF kurst MTM, keyed "from>to". */
  tcurf: Record<string, { ffact: number; tfact: number }>
  /** TCURR kurst M by "lead-follow" pair, ascending by date. */
  marketRates: Record<string, { d: string; r: number }[]>
  /** TCURR kurst RBI for USD:INR by date. */
  rbiRates: Record<string, number>
  /** ZSGTSFTR_SS_SPOT: model, option side (01 645/646, 02 643), put/call (1 Put, 2 Call). */
  ssSpot: { model: string; opBs: string; pc: string; bs1: string; curr1: string; bs2: string; curr2: string }[]
  /** ZSGTRMFM_LEAD_CURR ranking (KEPT STATIC: the FM is not in the export). */
  leadRank: string[]
}
