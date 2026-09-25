export type MasterContract = {
  /** Kept as text, as in the original: SAP's MC numbers are NUMC keys, not arithmetic values. */
  mcNumber: string
  mcReferenceNo: string
  mcDescription: string
  originEntity: string
  originEntityName: string
  region: string
  coArea: string
  fxModel: string
  modelDescription: string
  entityString: string
  mcDate: string
  currencyString: string
  status: string
  gtCommodity: string
  commodity: string
  commodityDescriptionLong: string
  businessPartnerD1: string
  businessPartnerD2: string
  shipmentStart: string
  shipmentEnd: string
  mcAmountUSD: number
  currency: string
  exchangeRate: number
  mcAmountOrigin: number
  originCurrency: string
  utilization: number
  balanceAmount: number
  utilizationOrigin: number
  balanceOrigin: number
  portOfShipment: string
  portOfDestination: string
  paymentTerms: string
  paymentTermsDesc: string
  moRemarks: string
  foRemarks: string
  createdMCReference: string
  enteredBy: string
  enteredOn: string
}

export type Entity = { code: string; name: string; region: string }
export type FxModel = { code: string; desc: string }

export type Layout = 'default' | 'compact'

/** The selection screen as typed — nothing here is applied until View Contracts. */
export type CriteriaForm = {
  mcDateFrom: string
  mcDateTo: string
  mcFrom: string
  mcTo: string
  /** Free text in the Origin Entity / FX Model searchable dropdowns. */
  originEntity: string
  region: string
  fxModel: string
  coArea: string
  mcStatus: string
  layout: Layout
}

/** The criteria the loaded result set was selected with (the original's state.criteria). */
export type Criteria = {
  mcDateFrom: Date | null
  mcDateTo: Date | null
  mcFrom: string
  mcTo: string
  originEntity: string
  region: string
  fxModel: string
  coArea: string
  mcStatus: string
  layout: Layout
}

export type CriteriaError = { from: boolean; to: boolean; message: string }

export type Filters = {
  originEntity: string
  fxModel: string
  mcStatus: string
  commodity: string
  currencyString: string
  businessPartner: string
}

export type ColumnKey = keyof MasterContract | 'action'

export type Column = { key: ColumnKey; label: string; sortable: boolean; cls?: string; num?: boolean }

export type SortField = keyof MasterContract
export type Sort = { field: SortField; dir: 'asc' | 'desc' }

export type DropdownOption = { value: string; code: string; sub: string }

export type Toast = { id: number; message: string; error: boolean }
