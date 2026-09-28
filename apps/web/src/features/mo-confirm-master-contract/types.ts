export type Region = { id: string; name: string }
export type Entity = { code: string; cocode: string; name: string; region: string; origin: boolean }
export type Commodity = { code: string; desc: string }
export type PaymentTerm = { code: string; desc: string }
export type PortPair = { ship: string; dest: string }

/**
 * An FX Model pre-sets the 3-entity chain (Entity String) and the currency each leg settles
 * in (Currency String) — the "route" every deal booked under this model will follow.
 */
export type FxModel = {
  code: string
  desc: string
  entities: string[]
  curr: string[]
  entityId: string
  currId: string
}

export type StatusKey = 'RELEASE' | 'ERRCORR' | 'CONFIRMED' | 'INUSE' | 'REJECTED'
/**
 * The ABAP status text, code first ("02-Release to MO"), exactly as the SAP table holds it.
 * Two codes land under ERRCORR: 13 is FO's correction of an 11 (Reject), 22 is FO's correction
 * of a 21 (Correction after Deal) — both come back to this queue for MO to review again.
 */
export type StatusValue =
  | '02-Release to MO'
  | '13-FO: Error Correction - Correct'
  | '22-FO: Error Correction - Correct'
  | '03-Confirmed by MO'
  | '04-In-Use'
  | '11-MO->FO: Correction Required'

/** One row of the legacy page's MC_SEED block, before the derived columns are filled in. */
export type McSeed = {
  n: number
  model: string
  status: StatusValue
  comm: string
  client: string
  /** DD.MM.YYYY, as the SAP export writes it. */
  date: string
  amtUSD: number
  exRate: number
  shipStartOff: number
  shipDur: number
  dealId: string
  /** Why an Error Correction row was sent back; becomes its MO Remark. */
  moNote?: string
}

export type MasterContract = {
  mcNumber: number
  mcReference: string
  dealId: string
  fxModel: string
  modelDesc: string
  entities: string[]
  entityId: string
  currChain: string[]
  currId: string
  status: StatusValue
  mcDescription: string
  mcDate: Date
  originEntity: string
  commodityCode: string
  commodityDesc: string
  amtUSD: number
  amtOrigin: number
  currOrigin: string
  exRate: number
  shipStart: Date
  shipEnd: Date
  balUSD: number
  utilizedAmt: number
  paymentTerms: string
  paymentDate: Date
  portOfShipment: string
  portOfDestination: string
  moRemarks: string
  foRemarks: string
  enteredBy: string
  enteredOn: Date
  entryTime: string
  changedBy: string
  changedOn: Date | null
}

/** The status filter: every queue status, or just one of the two this queue holds. */
export type StatusFilter = 'ALL' | StatusKey

/** Everything but status; 'ALL' means the dropdown is on its "All ..." option. */
export type Filters = {
  /** The search box as typed; matching trims it and ignores case. */
  q: string
  entity: string
  region: string
  model: string
  /** DD-MM-YYYY, as shown in the MC Date pickers. */
  dateFrom: string
  dateTo: string
}

export type SortKey = 'mcNumber' | 'fxModel' | 'mcDate' | 'amtUSD'
/** 1 ascending, -1 descending — the legacy sortDir. */
export type Sort = { key: SortKey; dir: 1 | -1 }

export type Kpis = { total: number; counts: { RELEASE: number; ERRCORR: number }; totalUSD: number }

export type McAction = 'confirm' | 'reject'
/** 'bulk' acts on the current selection; a number is the single MC from the child modal. */
export type ActionScope = 'bulk' | number

/** One Sale or Purchase row of the child-contract (trade leg) breakdown. */
export type ChildLeg = {
  t: string
  seller: string
  buyer: string
  ref: number
  ps: 'Sale' | 'Purchase'
  desc: string
  amt: number
  bal: number
  planned: number
  curr: string
}

export type ToastKind = '' | 'info' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind; show: boolean }
