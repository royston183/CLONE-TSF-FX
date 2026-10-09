/** One OTTK row of the selection list, and the workspace state the page writes back onto it. */
export type Ottk = {
  tsfStructure: string
  entityString: string
  ottkStatDesc: string
  ottkNo: string
  ottkValue: number
  ottkCurr: string
  trader: string
  dealId: string
  dttkNo: string
  iclReceivedTxn: string
  iclRecAmount: string
  expectedDate: string
  coCode1: string
  coCode2: string
  companyCode: string
  companyName: string
  businessArea: string
  businessAreaName: string
  lcIssuanceBank: string
  lcIssuanceBankName: string
  iclGivenComp: string
  iclGivenName: string
  iclReceivedComp: string
  iclReceivedName: string
  entityId: string
  entityStringFull: string
  depositValue: string
  interestCategory: string
  interestRate: number
  lcApp: string
  ottkBankDesc: string
  noOfDays: number
  directIndirect: string
  /** Present only on the generated demo rows; the original never displays it. */
  layout?: string | undefined
  // Written by the deposit and ICL workspaces once the user saves.
  depositTradeValue?: number | undefined
  depositAmount?: number | undefined
  depositFixing?: string | undefined
  depositStart?: string | undefined
  depositEnd?: string | undefined
  paymentBank?: Bank | undefined
  iclRequestAmount?: string | undefined
  requestNo?: string | undefined
}

/** One row of the Partner Bank picker. */
export type Bank = {
  coCd: string
  houseBank: string
  bankKey: string
  bankAccount: string
  bankName: string
  currency: string
  partnerBank: string
}

/** A header cell of one of the four tables: label plus the fixed width the original sets. */
export type HeaderColumn = {
  label: string
  width: number
  required?: boolean
}

export type ListColumn = HeaderColumn & {
  key: ListColumnKey
  /** Right-aligned and thousands-separated, as `.data-table .number` expects. */
  number?: boolean
}

export type ListColumnKey =
  | 'entityString'
  | 'dealId'
  | 'ottkNo'
  | 'dttkNo'
  | 'ottkValue'
  | 'ottkCurr'
  | 'lcApp'
  | 'ottkStatDesc'
  | 'ottkBankDesc'
  | 'trader'
  | 'requestNo'

export type BankColumn = HeaderColumn & { key: keyof Bank }

/** Which table a sort belongs to. `deposit` and `icl` hold one row, so they only mark the header. */
export type SortPrefix = 'list' | 'bank' | 'deposit' | 'icl'

export type SortState = {
  table: SortPrefix | ''
  index: number
  direction: 'asc' | 'desc' | ''
}

export type Toast = {
  id: number
  kind: 'success' | 'warning' | ''
  message: string
}
