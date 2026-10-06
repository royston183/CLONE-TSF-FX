export type DealType = 'FX' | 'Options'

/** The three statuses the page knows, exactly as the SAP status text reads. */
export type DealStatus = 'FO->MO: Unmatched' | 'MO->FO: Correction Required' | 'Matched & Released'

export type CompanyInfo = { companyName: string; group: string; profitCenter: string; businessArea: string }
export type Partner = { code: string; name: string }
export type TxnType = { code: string; desc: string }
export type Trader = { code: string; name: string; shortName: string }

/** One row of the MO deal-confirmation queue, as the page's buildDeal produced it. */
export type Deal = {
  /** The row's own key (company code and transaction for a SAP deal); not what the Deal ID column shows. */
  id: string
  /** The TSF Deal ID (ZSGTSFTR_DEALID) the transaction is on, or '' when it is on none. */
  dealId: string
  dealType: DealType
  coCode: string
  transaction: string
  partnerCode: string
  partnerName: string
  txnTypeCode: string
  txnTypeDesc: string
  tradeDate: Date
  buySell1: string
  currency1: string
  amount1: number
  buySell2: string
  currency2: string
  amount2: number
  fixingDate: Date
  valueDate: Date
  allInRate: number
  status: DealStatus
  traderCode: string
  traderName: string
  traderShort: string
  groupDesc: string
  companyName: string
  profitCenterDesc: string
  businessAreaDesc: string
  accounting: string
  assignment: string
  fixRefId: string
  foRemark: string
  moRemark: string
}

/**
 * The Basic Selection screen. The combobox fields hold the text as typed; the matching `*Code`
 * is only set when an option is picked, and typing clears it again — as the page's setupCombo
 * did — so free text that happens to spell a code does not filter.
 */
export type SelectionForm = {
  companyCodeText: string
  companyCode: string
  companyCodeToText: string
  companyCodeTo: string
  blotterDate: string
  traderText: string
  trader: string
  layout: string
  displayType: DealType
}

/** What View Deals ran with: the criteria the table is filtered by. */
export type AppliedSelection = {
  companyCode: string
  companyCodeTo: string
  trader: string
  displayType: DealType
}

/** The filter panel; '' is each dropdown's "All". */
export type Filters = {
  coCode: string
  txnType: string
  partner: string
  trader: string
  ccy1: string
  ccy2: string
  status: string
}

export type ColumnType = 'date' | 'amount' | 'rate'

export type SortKey =
  | 'dealId'
  | 'coCode'
  | 'transaction'
  | 'partnerName'
  | 'tradeDate'
  | 'currency1'
  | 'amount1'
  | 'fixingDate'
  | 'valueDate'
  | 'status'
  | 'traderName'

export type SortDir = 'asc' | 'desc'
/** key null until a sortable header is first clicked: the table then keeps seed order. */
export type Sort = { key: SortKey | null; dir: SortDir }

export type Column =
  | { key: 'select'; label: string; sortable?: undefined; type?: undefined }
  | { key: SortKey; label: string; sortable: true; type?: ColumnType }
  | { key: Exclude<keyof Deal, 'dealType'>; label: string; sortable?: false; type?: ColumnType }

/** Checkbox-column drag: the anchor row's state decides whether the sweep selects or clears. */
export type DragMode = 'select' | 'deselect'

export type ComboOption = { code: string; display: string; searchText: string; sub: string }

export type SelectOption = { value: string; label: string }

/** The Match & Release / Correction Required info strip and Cover No. */
export type DealSummary = { dealId: string; partner: string; coverNo: string }

export type ToastType = 'success' | 'error'
export type Toast = { id: number; type: ToastType; title: string; message: string; fading: boolean }

export type StatusModalType = 'success' | 'error'
export type StatusModalState = { type: StatusModalType; heading: string; message: string; title: string }

/** One day cell of the Upto Blotter Date calendar. */
export type CalendarCell = { day: number; muted: boolean; today: boolean; selected: boolean }
