/** Tone of a deal status; picks the .status-text-<tone> colour. */
export type StatusTone = 'draft' | 'pending' | 'confirmed' | 'matured' | 'in-use'

/** ZSGTSFTR_COMP (search help ZSGTSFSH_ENTITY): origin entity and its region. */
export type Entity = { code: string; name: string; regionId: string }
/** ZSGTSFSH_REGION: the region codes ZSGTSFTR_COMP carries; no region text table is served. */
export type Region = { id: string; name: string }
/** ZSGTSFTR_DEAL_ST at ZSUB_TYPE 'FX1'. */
export type DealStatus = { code: string; sdesc: string }

/** ZSGTSFTR_RULE_BT: an FX model per CO area. */
export type RuleBt = { coArea: string; id: string; desc: string; subType: string }
/** ZSGTSFTR_SET_TYP rows WHERE zhead_fx <> space OR zhead_opt <> space. */
export type HeadsUpIndicator = { modelId: string; headFx: string; headOpt: string }

export type LayoutOption = { id: string; name: string }

/** ZSGTSFTR_MAS_CON, the fields the report reads. */
export type MasterContract = {
  ref: string
  origin: string
  modelId: string
  modelDesc: string
  currId: string
  desc: string
  commodity: string
  /** ISO yyyy-mm-dd, '' for none */
  date: string
  amt: number
}

/** ZSGTSFTR_DEALID, the fields the report reads. Dates are ISO yyyy-mm-dd ('' for none). */
export type Deal = {
  dealId: string
  dealType: string
  subType: string
  dealDesc: string
  startDate: string
  maturityDate: string
  mcRef: string
  status: string
  confirmed: boolean
  plAmt: number
  plCurr: string
  plRate: number
  currId: string
  createdBy: string
  createdDate: string
  createdTime: string
  changedBy: string
  changedDate: string
  changedTime: string
}

/** ZSGTSFCDS_OPTION row (and the common part of ZSGTSFCDS_FX). */
export type Leg = { dealId: string; type: string; mcRef: string; curr1: string; curr2: string; amt1: number; amt2: number }
/** ZSGTSFCDS_FX row. */
export type FxLeg = Leg & { sgsart: string; bp: string; ndfDate: string }

/** Everything the report reads, as loaded from the middleware. */
export type ScreenData = {
  /** ZSGTSFTR_DEALID, all rows (the Deal ID help lists them; the report keeps ZMC_REF <> space). */
  deals: Deal[]
  masterContracts: MasterContract[]
  entities: Entity[]
  statuses: DealStatus[]
  rules: RuleBt[]
  indicators: HeadsUpIndicator[]
  /** ZSGTSFTR_IN_SPOT: Deal IDs with spot data saved. */
  spotDealIds: Record<string, boolean>
  /** ZSGTSFCDS_FX legs; null while the middleware cannot serve them (WAITING FOR API). */
  fxLegs: FxLeg[] | null
  /** ZSGTSFCDS_OPTION legs; null while the middleware cannot serve them (WAITING FOR API). */
  optLegs: Leg[] | null
}

/** One ALV row (ty_data). */
export type HeadsUpRow = {
  dealId: string
  dealType: string
  subType: string
  dealDesc: string
  startDate: string
  maturityDate: string
  mcRef: string
  status: string
  statusDesc: string
  origin: string
  region: string
  modelId: string
  modelDesc: string
  coArea: string
  coModelDesc: string
  mcDesc: string
  mcDate: string
  mcAmt: number
  /** null while ZSGTSFCDS_FX / _OPTION are not served: no utilization can be computed. */
  utiAmt: number | null
  dealCurrId: string
  confirmed: boolean
  plAmt: number
  plCurr: string
  plRate: number
  ndfDate: string
  bank: string
  spot: boolean
  createdBy: string
  createdDate: string
  createdTime: string
  changedBy: string
  changedDate: string
  changedTime: string
}
export type ColumnKey = keyof HeadsUpRow

export type ColumnType = 'deal' | 'mc' | 'status' | 'date' | 'amt' | 'rate' | 'flag'
export type Column = {
  key: ColumnKey
  label: string
  type?: ColumnType
  /** Colour-coding of the column (Master Contract blue / Deal ID green). */
  color?: 'blue' | 'green'
  num?: boolean
  sticky?: boolean
}

/** The SAP selection screen: Key Date (ISO), Region, Origin Entity, Deal ID, Status, CO Area. */
export type Filters = {
  keyDate: string
  region: string
  entity: string
  dealId: string
  status: string
  coArea: string
}

export type Sort = { field: ColumnKey; dir: 'asc' | 'desc' }

export type MailPlanDeal = { dealId: string; mails: string[] }
export type MailPlan = { deals: MailPlanDeal[]; mailCount: number }

/** The Master Contract popup (hotspot ZMC_REF -> ZSGTSFFM_MC_DETAILS), from ZSGTSFTR_MAS_CON + COMP. */
export type MasterContractDetail = {
  ref: string
  origin: string
  originName: string
  region: string
  modelId: string
  modelDesc: string
  currId: string
  desc: string
  commodity: string
  date: string
  amt: number
}

/** Result of the Key Date box reacting to typed text. */
export type TypedDateResult =
  | { kind: 'clear' }
  | { kind: 'commit'; iso: string; text: string; view: { year: number; month: number } }
  | { kind: 'error' }
  | { kind: 'none' }

/** A month as the calendar lays it out: days of the previous month, the month itself, days of the next. */
export type CalendarGrid = { leading: number[]; daysInMonth: number; trailing: number[] }
