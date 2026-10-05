/** Tone of a deal status; picks the .status-text-<tone> colour. */
export type StatusTone = 'draft' | 'pending' | 'confirmed' | 'matured' | 'in-use'

export type Entity = { code: string; companyCode: string; name: string; currency: string; regionId: string; fxRate: number }
export type Region = { id: string; name: string }
export type DealStatus = { code: string; sdesc: string; tone: StatusTone }

/** zsgtsftr_rule_bt + zsgtsftr_set_typ: a model per CO area and sub type, with its heads-up indicators. */
export type Model = {
  id: string
  desc: string
  subType: 'FX1' | 'FX2'
  coArea: string
  /** 'X' when the model has the FX heads-up indicator. */
  headFx: string
  /** 'X' when the model has the option heads-up indicator. */
  headOpt: string
}

export type LayoutOption = { id: string; name: string }
export type CurrentUser = { name: string; authorizedCoAreas: readonly string[] }

/** zsgtsftr_mas_con row as seeded (before its reference is derived). */
export type McSeed = {
  no: string
  origin: string
  modelId: string
  currId: string
  commodity: string
  /** ISO yyyy-mm-dd */
  date: string
  amt: number
}
export type MasterContract = McSeed & { ref: string }

/** zsgtsftr_dealid seed: [MC no, start date, maturity date, status, confirmed (1/0), USD amount]. */
export type DealSeed = readonly [mcNo: string, start: string, maturity: string, status: string, confirmed: number, usd: number]

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

export type Leg = { dealId: string; type: string; curr1: string; curr2: string; amt1: number; amt2: number }
export type FxLeg = Leg & { sgsart: string; bp: string; ndfDate: string }

/** The derived tables the original builds once in buildMockTables(). */
export type Tables = {
  masterContracts: MasterContract[]
  deals: Deal[]
  fxLegs: FxLeg[]
  optLegs: Leg[]
  spotDealIds: Record<string, boolean>
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
  utiAmt: number
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

export type FetchResult = { error: string | null; rows: HeadsUpRow[] }

export type MailPlanDeal = { dealId: string; mails: string[] }
export type MailPlan = { deals: MailPlanDeal[]; mailCount: number }

/** What ZSGTSFFM_MC_DETAILS stand-in returns for the Master Contract modal. */
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
