/** One deal of the error-correction queue (TXN_STATUS 11); see api.ts rowFromRecord. */
export type NdfRow = {
  rfha: string
  bukrs: string
  company: string
  product: string
  pair: string
  side: 'Buy' | 'Sell'
  amt1: number
  curr1: string
  amt2: number
  curr2: string
  /** DD-MM-YYYY. */
  fixDate: string
  fixRef: string
  fixRefName: string
  oldRate: number
  trader: string
  partner: string
  /** Custom TSF TXN_STATUS: 11 = waiting for correction, 12 = corrected. */
  status: string
  statusText: string
  /** Whether amt1/curr1 is the foreign leg the settlement formula divides by the new rate. */
  foreignFirst: boolean
  settleCurr: string
  /** NDF_MO_REM: why MO sent the fixing back. */
  moRemark: string
  /** NDF_FO_REM */
  foRemark: string
  /** TrmFxApp's ETag: Update sends it back as If-Match. */
  etag: string
}

export type SortKey = 'rfha' | 'bukrs' | 'company' | 'product' | 'pair' | 'side' | 'amt1' | 'curr1' | 'amt2' | 'curr2' | 'fixDate' | 'fixRef' | 'oldRate' | 'trader' | 'partner' | 'statusText'
export type Sort = { key: SortKey; dir: 1 | -1 }

export type Filters = { search: string; company: string; fixDate: string }

export type Toast = { id: number; message: string; success: boolean }
