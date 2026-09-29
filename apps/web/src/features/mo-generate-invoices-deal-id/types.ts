export type DealStatus = '04' | '05' | '07'

export type FxRow = {
  dealType: string
  roll: string
  bukrs: string
  bp: string
  partner: string
  rfha: string
  start: string
  end: string
  entity: string
  pc1: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  pc2: string
  curr2: string
  amt2: number
  allIn: number
  strike: number
  mc: string
  txn: string
}

export type InvRow = {
  ttype: string
  invType: string
  seller: string
  buyer: string
  bp: string
  partnerBank: string
  houseBank: string
  accountId: string
  invDate: string
  dueDate: string
  commodity: string
  gtComm: string
  qty: number
  usdPrice: number
  rate: number
  price: number
  amt: number
  amtUsd: number
  planned: number
  invNo: string
  pc: string
  locked: boolean
}

export type BlRow = {
  blNo: string
  blDate: string
  lot: string
  tfNo: string
  tfSplit: string
  vessel: string
  pol: string
  pod: string
  commodity: string
  qty: number
  status: string
  invType: string
  invDate: string
  reuse: string
  remark?: string
}

export type Deal = {
  dealId: string
  dealRef: string
  mcRef: string
  mcDesc: string
  modelId: string
  modelDesc: string
  entityString: string
  currencyString: string
  trader: string
  traderDesc: string
  status: DealStatus
  fxInvModel: string
  dealStart: string
  dealEnd: string
  mcDate: string
  shipStart: string
  shipEnd: string
  dm: boolean
  tolerance: number
  fx: FxRow[]
  inv: InvRow[]
  bl: BlRow[]
}

export type Sort<K extends string = string> = { key: K; dir: 1 | -1 }

export type Toast = { id: number; message: string; kind: 'success' | 'error' | 'warn' | 'info' }

export type ConfirmDialogState = {
  title: string
  text: string
  note: string
  yesLabel: string
  onYes: () => void
}
