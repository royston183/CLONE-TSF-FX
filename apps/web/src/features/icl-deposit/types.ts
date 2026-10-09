/** A partner bank row in the bank picker. */
export type Bank = {
  coCd: string
  houseBank: string
  bankKey: string
  bankAccount: string
  bankName: string
  currency: string
  partnerBank: string
}

/** One OTTK transaction, carrying whatever deposit / ICL request has been raised against it. */
export type IclRecord = {
  companyCode: string
  transactionNo: string
  requestStatus: string
  ottkNo: string
  ottkAmount: number
  ottkCurr: string
  dealId: string
  businessArea: string
  businessAreaName: string
  lcIssuanceBank: string
  lcIssuanceBankName: string
  startDate: string
  noOfDays: number
  interestRate: number
  interestCategory: string
  interestFrequency: string
  depositValue: string
  iclGivenComp: string
  iclGivenName: string
  iclReceivedComp: string
  iclReceivedName: string
  entityString: string
  depositId: string
  depositRequest: string
  depositTxn: string
  requestNo: string
  paymentBank: Bank | null
  /** Set once the deposit row is edited; until then the OTTK amount stands in for it. */
  depositTradeValue?: number | undefined
  depositFixing?: string | undefined
}

export type CompanyCode = { code: string; name: string }

/** A column of the overview table. `compute` derives the cell from the record. */
export type MainColumn = {
  key: string
  label: string
  width: number
  number?: boolean | undefined
  compute?: ((record: IclRecord) => string | number) | undefined
}

/** A column of one of the two single-row edit grids — label and width only. */
export type EditColumn = { label: string; width: number; required?: boolean }

export type ToastKind = 'success' | 'warning' | 'error' | ''

export type ToastItem = { id: number; kind: ToastKind; message: string }
