/** One transaction (leg) of a deal, with the original's SAP-style field names. */
export type Leg = {
  rfha: string
  bukrs: string
  butxt: string
  /** Product/txn type code: 619 Forward, 605 Spot, 631 Option, 607 Cash, 608 Tom. */
  sfhaart: string
  /** Trade date, ISO yyyy-mm-dd. */
  dblfz: string
  /** Value date, ISO yyyy-mm-dd. */
  delfz: string
  cpair: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  otot_rate: number
  kontrh: string
  bpName: string
  txnDesc: string
  dealType: string
  zuonr: string
  zroll: string
  ztsf_pre_mature: boolean
  ztsf_unwind: boolean
}

export type SortField = 'rfha' | 'bukrs' | 'bpName' | 'sfhaart' | 'dblfz' | 'delfz' | 'cpair' | 'otot_rate' | 'txnDesc'
export type SortDir = 'asc' | 'desc'
export type Sort = { field: SortField; dir: SortDir }

export type Filters = { type: string; status: string }

export type ToastKind = 'error' | 'warn' | undefined
export type Toast = { msg: string; kind: ToastKind }

export type DdOption = { value: string; primary: string; secondary?: string | undefined }

/** One side (New Booking or Cancellation) of an Early Delivery / Rollover. */
export type BookingForm = {
  type: string
  /** ISO dates; null when not picked. */
  tdate: string | null
  vdate: string | null
  bp: string
  rate: string
  buyAmt: string
  sellAmt: string
}

/** Early Delivery (screen 9001) and Rollover (screen 9003) share this shape. */
export type PairForm = { remark: string; newTxn: BookingForm; cancel: BookingForm }

/** Unwinding (screen 9002). */
export type UnwindForm = {
  remark: string
  tdate: string | null
  vdate: string | null
  bp: string
  rate: string
  buyAmt: string
  sellAmt: string
}

export type Kpis = { total: number; eligible: number; pm: number; unw: number }
