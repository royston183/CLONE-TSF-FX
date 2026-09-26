export type Side = 'Buy' | 'Sell'

export type NdfDeal = {
  id: string
  company: string
  trader: string
  side: Side
  pair: string
  amt1: number
  c1: string
  amt2: number
  c2: string
  spot: number
  swap: number
  fwd: number
  date: string
  ndf: number
  ref: string
  status: string
  remarks: string
  moRemarks: string
  fixRate?: number
  cashSettlement?: number
  foRemarks?: string
}

export type Filters = {
  search: string
  company: string
  trader: string
  fixingDate: string
}

export type ToastVariant = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  variant: ToastVariant
  message: string
}
