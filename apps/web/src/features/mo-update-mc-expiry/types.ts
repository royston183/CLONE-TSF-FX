/** One row of the SAP master-contract table as ZSGTSFR049 reads it (the legacy mock's shape). */
export type MasterContract = {
  mcNumber: string
  client: string
  mcReferenceNo: string
  mcDescription: string
  mcDate: string
  seller: string
  buyer: string
  originEntity: string
  mcAmount: number
  currency: string
  mcAmountOrigin: number
  originCurrency: string
  exchangeRate: number
  shipmentStart: string
  shipmentEnd: string
  gtCommodity: string
  commodity: string
  commodityDescription: string
  entityId: string
  entityString: string
  currencyString: string
  paymentTerms: string
  fxModel: string
  modelDescription: string
  portOfShipment: string
  portOfDestination: string
  createdMC: string
  utilization: number
  balanceAmount: number
  days: number
  moRemarks: string
  foRemarks: string
  enteredBy: string
  enteredOn: string
  entryTime: string
  changedBy: string
  changedOn: string
  changeTime: string
  status: string
  /** ZMC_STAT as stored, for rows read from MySQL; the seed rows carry only the text. */
  statusCode?: string
}

/** "MC View Only" lets the user expire rows by hand; "MC View with Expiry Posting" expires them all. */
export type PostingMode = 'view' | 'post'

export type SortField =
  | 'status'
  | 'mcNumber'
  | 'mcReferenceNo'
  | 'originEntity'
  | 'mcDescription'
  | 'mcDate'
  | 'mcAmount'
  | 'currency'
  | 'exchangeRate'
  | 'shipmentStart'
  | 'shipmentEnd'

export type Sort = { field: SortField; dir: 'asc' | 'desc' }

/**
 * The shared Confirm Expiry Update popup. 'manual' expires the selected rows; 'batch' is the
 * "MC View with Expiry Posting" radio, which only takes effect once the user presses Expire.
 */
export type ExpiryConfirm = { mode: 'manual' | 'batch'; ids: string[]; heading: string; subtext: string }

export type KeyDateCheck = { ok: true; date: Date } | { ok: false; error: string }

export type Toast = { id: number; message: string }
