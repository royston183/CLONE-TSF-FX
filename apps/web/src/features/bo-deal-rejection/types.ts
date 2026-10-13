/** FX deals or Options deals - the two result sets the report lists. */
export type TxnType = 'FX' | 'OP'

/** How a field is shown: text as-is, amounts 2 dp, rates 4 dp (swap points 6), blank when zero. */
export type FieldType = 'text' | 'date' | 'time' | 'amt' | 'rate'

export type FieldDef = {
  key: string
  label: string
  type: FieldType
  group: string
}

/** The field definitions of one transaction type, in details-popup order. */
export type FieldDefs = {
  list: FieldDef[]
  byKey: Record<string, FieldDef>
}

/**
 * One deal row, keyed by the ABAP field name (rfha, bukrs, txn_status, ...). Dates are
 * dd-mm-yyyy text, amounts and rates are numbers, everything else is text. "bo_rem" (the BO
 * remark) is only set once a deal has been rejected.
 */
export type Deal = Record<string, string | number>

export type Company = {
  code: string
  name: string
  entity: string
  currency: string
  pc: string
  pcName: string
  ba: string
  baName: string
  portfolio: string
  acct: string
}

export type Partner = { id: string; name: string }
export type Trader = { id: string; code: string; name: string }
export type TxnTypeOption = { code: string; text: string }

export type StatusMeta = {
  /** External Status Desc column text. */
  ext: string
  /** Status the transaction is moved to on rejection. */
  target: string
  textCls: string
}

export type SortState = { field: string; dir: 'asc' | 'desc' }

export type Deals = Record<TxnType, Deal[]>

/** Rejected deal keys; a rejected deal never shows in the list again until Refresh. */
export type Flags = Record<string, true>

/** A marked deal waiting to be rejected, with the remark typed for it. */
export type MarkedItem = { key: string; deal: Deal; remark: string }

export type RejectResult = { rfha: string; bukrs: string; newStatus: string }

export type CalendarView = { year: number; month: number }

export type CalendarCell = {
  day: number
  /** A day of the previous/next month, shown greyed and not clickable. */
  muted: boolean
  selected: boolean
  today: boolean
}

export type Toast = { text: string; error: boolean; show: boolean }
