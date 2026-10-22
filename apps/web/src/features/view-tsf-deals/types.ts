export type Selection = { company: string; from: string; to: string; trader: string }
export type Company = { code: string; name: string }
export type Trader = { code: string; name: string }
export type Lookups = { companies: Company[]; traders: Trader[] }

export type DealReportRow = {
  id: string
  rfha: string
  bukrs: string
  companyName: string
  dealId: string
  dealDesc: string
  dealType: string
  product: string
  transactionType: string
  activity: string
  partner: string
  bpName: string
  blotter: string
  tradeDate: string
  valueDate: string
  bs1: string
  curr1: string
  amt1: number | null
  bs2: string
  curr2: string
  amt2: number | null
  spot: number | null
  swap: number | null
  allRate: number | null
  rateBasis: string
  pnl: number | null
  pnlCurrency: string
  localPnl: number | null
  localPnlCurrency: string
  trader: string
  traderCode: string
  externalRef: string
  internalRef: string
  statusCode: string
  status: string
  reversed: boolean
  execution: string
  mcRef: string
  mcDesc: string
  commodity: string
  model: string
  modelDesc: string
  subType: string
  portfolio: string
  businessArea: string
  foRemark: string
  moRemark: string
  ndfDate: string
  ndfRef: string
  ndfRate: number | null
  cashAmount: number | null
  cashCurrency: string
  ndfFoRemark: string
  ndfMoRemark: string
  enteredBy: string
  created: string
  changedBy: string
  changed: string
}

export type Column = { field: keyof DealReportRow; label: string; kind?: 'date' | 'amount' | 'rate' | 'pnl' | 'localPnl' | 'ndfRate' }
export type Sort = { field: keyof DealReportRow; direction: 'asc' | 'desc' }
