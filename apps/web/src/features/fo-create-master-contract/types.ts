export type OriginEntity = { code: string; companyCode: string; name: string; currency: string }
export type Commodity = { code: string; name: string; desc: string }
export type PaymentTerm = { code: string; label: string }
/**
 * `entityId` / `currId` are ZSGTSFTR_RULE_BT's ZENT_ID / ZCURR_ID, written to the MC. The
 * dummy models carry none; api.ts resolves them.
 */
export type FxModel = { id: string; code: string; desc: string; entity: string; currency: string; entityId?: string; currId?: string }
export type StatusMeta = { cls: string; textCls: string }

export type MasterContract = {
  mcNumber: number
  status: string
  /** ABAP status code: '01' newly created, '02' released to M.O. The seed rows have none. */
  statusCode?: string | null
  originEntity: string
  originEntityName: string
  originCurrency: string
  fxModelId: string
  fxModelCode: string
  fxModelDesc: string
  entityString: string
  currencyString: string
  commodityCode: string
  commodityName: string
  /** Only for the C101 "Multiple Commodity" code: the child commodities picked for it. */
  selectedCommodities?: string[] | null
  mcDate: string
  mcAmountUsd: number
  mcAmountOrigin: number
  exchangeRate: number
  tolerance: number
  reference: string
  paymentTerms: string
  paymentDate: string
  portShipment: string
  portDestination: string
  shipStart: string
  shipEnd: string
  /** A linked Deal ID blocks editing, as in the ABAP change flow. */
  linkedDealId?: string | null
}

export type ChildContract = {
  parentMcNumber: number
  childType: string
  childContractNo: string
  childReference: number
  description: string
  sellEntity: string
  buyEntity: string
  side: string
  sideCode: string
  tradeType: string
}

export type TradeType = 'T1' | 'T2' | 'T3'

/** Child contracts per MC number plus the T1/T2/T3 number ranges they are drawn from. */
export type ChildStore = {
  byMc: Record<string, ChildContract[]>
  nextRef: Record<TradeType, number>
}

export type FormMode = 'create' | 'edit' | 'copy'

/** The Create / Edit / Copy form as typed. Codes are null until picked from a dropdown. */
export type FormValues = {
  originEntity: string | null
  mcDate: string
  mcAmountUsd: string
  exchangeRate: string
  mcReference: string
  tolerance: string
  commodity: string | null
  selectedCommodities: string[]
  shipStart: string
  shipEnd: string
  paymentTerms: string | null
  paymentDate: string
  portShipment: string | null
  portDestination: string | null
  fxModel: string | null
}

export type FieldKey =
  | 'originEntity'
  | 'mcDate'
  | 'mcAmountUsd'
  | 'exchangeRate'
  | 'commodity'
  | 'shipStart'
  | 'shipEnd'
  | 'tolerance'
  | 'fxModel'

export type FieldErrors = Partial<Record<FieldKey, boolean>>

export type SortField =
  | 'status'
  | 'mcNumber'
  | 'originEntity'
  | 'fxModelCode'
  | 'commodityName'
  | 'mcDate'
  | 'mcAmountUsd'
  | 'exchangeRate'
  | 'shipStart'
  | 'shipEnd'

export type Sort = { field: SortField; dir: 'asc' | 'desc' }
export type Filters = { status: string; entity: string; fxModel: string; commodity: string }

export type Toast = { message: string; error: boolean; id: number }
