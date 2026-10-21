import type { TfFilters, TrdFlowKey, TrdFlowRow } from './types.ts'

/**
 * One control on a tab. `field` is the TrdFlow property it binds to; a descriptor without
 * one is a legacy control that has no SAP source yet — it is rendered disabled rather than
 * dropped, because the generated stylesheet lays each section out as a fixed-column grid
 * and a missing cell shifts every one after it.
 *
 * `control` and `readOnly` mirror the original element, which the stylesheet styles
 * differently: a <select> is not a text box, and a readonly input is not a disabled one.
 */
export type FieldDescriptor = {
  id: string
  label: string
  field?: keyof TrdFlowRow
  type: 'text' | 'date' | 'number'
  control?: 'input' | 'select'
  readOnly?: boolean
  /** Shows a looked-up value rather than a column (see FieldGrid's `derivedValue`). */
  derived?: boolean
}

/**
 * A `.section-box` within a tab: its heading, the grid class controlling column count, and
 * its fields. The legacy page varies the column count per section — grid6, grid5, grid4,
 * grid3 — so a single shared grid class misaligns every tab but one.
 */
export type Section = {
  heading: string
  /** The legacy grid modifier: 'grid6' | 'grid5' | 'grid4' | 'grid3' | 'single' | ''. */
  grid: string
  fields: readonly FieldDescriptor[]
}

export const BASIC_SECTIONS: readonly Section[] = [
  {
    heading: 'Basic Data',
    grid: 'grid6',
    fields: [
      { id: 'bdBu', label: 'BU', field: 'Zbu', type: 'text', readOnly: true },
      { id: 'bdBuCode', label: 'BU Code', field: 'ZbuId', type: 'text', readOnly: true },
      { id: 'bdGtCommod', label: 'GT Commodity', field: 'ZtrmComId', type: 'text', control: 'select' },
      // Not a column: the commodity master's description, looked up (see masters.buCommodity).
      { id: 'bdBuCommodity', label: 'BU Commodity', type: 'text', readOnly: true, derived: true },
      { id: 'bdChild1', label: 'Child Comm: Name 1', field: 'ZchName1', type: 'text' },
      { id: 'bdChild2', label: 'Child Comm: Name 2', field: 'ZchName2', type: 'text' },
    ],
  },
  {
    heading: 'Invoice Data',
    grid: 'grid5',
    fields: [
      { id: 'idQty', label: 'Qty (MT)', field: 'Zquantity', type: 'number', readOnly: true },
      // ZUNIT is SE11's "Contract Price", ZCPRICE the current market price (see TF_FIELD_MAP).
      { id: 'idContractPrice', label: 'Contract Price (USD)', field: 'Zunit', type: 'number' },
      { id: 'idCmp', label: 'Current Market Price(MT)', field: 'Zcprice', type: 'number' },
      { id: 'idContractAmt', label: 'Contract Amount (USD)', field: 'Zttv', type: 'number', readOnly: true },
      { id: 'idCpmtAmt', label: 'CPMT Amount (USD)', field: 'ZcpmAmt', type: 'number', readOnly: true },
    ],
  },
  {
    heading: 'Other Data',
    grid: 'grid5',
    fields: [
      { id: 'odTfType', label: 'TF Type', field: 'ZtfType', type: 'text', control: 'select' },
      { id: 'odBuContact', label: 'BU Contact Person', type: 'text', readOnly: true },
    ],
  },
]

export const SHIPPING_SECTIONS: readonly Section[] = [
  {
    heading: 'Shipping Data',
    grid: 'grid4',
    fields: [
      { id: 'shVessel', label: 'Vessel Name', field: 'ZblVsslName', type: 'text' },
      { id: 'shBlNumber', label: 'BL Number', field: 'Zblno', type: 'text' },
      { id: 'shSustain', label: 'Sustainability flows', type: 'text' },
      { id: 'shLoadPort', label: 'Load Port', field: 'Zpol', type: 'text' },
      { id: 'shDischargePort', label: 'Discharge Port', field: 'Zpod', type: 'text' },
      { id: 'shTransit', label: 'Transit time', field: 'Zdays', type: 'text', readOnly: true },
      { id: 'shPolCountry', label: 'POL Country', field: 'ZpolCtry', type: 'text' },
      { id: 'shPodCountry', label: 'POD Country', field: 'ZpodCtry', type: 'text' },
      { id: 'shSailingDate', label: 'Sailing Date', field: 'Zsldate', type: 'date' },
      { id: 'shReceiptDate', label: 'Receipt Date', field: 'ZblRcpdt', type: 'date' },
      { id: 'shEta', label: 'ETA at POD', field: 'ZetaDsPort', type: 'date' },
      { id: 'shNotifyParty', label: 'Notify Party', field: 'Znotify', type: 'text' },
    ],
  },
  {
    heading: 'Title With OIL',
    grid: 'grid4',
    fields: [
      { id: 'shFromDate', label: 'From Date', field: 'Zotfd', type: 'date' },
      { id: 'shToDate', label: 'To Date', field: 'Zottd', type: 'date' },
    ],
  },
  {
    heading: 'BL Data',
    grid: 'grid4',
    fields: [
      { id: 'shBlConsignee', label: 'BL Consignee', field: 'Zcob', type: 'text' },
      { id: 'shLcDetails', label: 'LC Details', field: 'Zlc', type: 'text' },
      { id: 'shBl13From', label: 'BL 1/3 From', field: 'Zaobf13', type: 'date' },
      { id: 'shBl13To', label: 'BL 1/3 To', field: 'Zaobt13', type: 'date' },
      { id: 'shBl33From', label: 'BL 3/3 From', field: 'Zaobf33', type: 'date' },
      { id: 'shBl33To', label: 'BL 3/3 To', field: 'Zaobt33', type: 'date' },
    ],
  },
]

export const PURCH_SALES_SECTIONS: readonly Section[] = [
  {
    heading: 'Purchase Leg',
    grid: 'grid3',
    fields: [
      { id: 'plContract', label: 'Purch Contract', field: 'ZconNum1', type: 'text' },
      { id: 'plIncoterms', label: 'Purch Incoterms', field: 'ZpurInc', type: 'text' },
      { id: 'plPayTerms', label: 'Purch Pay Terms', field: 'Zpaypur', type: 'text' },
      { id: 'plSellerBank', label: 'Purch - Seller Bank', field: 'Zbplsb', type: 'text' },
      { id: 'plBuyerBank', label: 'Purch - Buyer Bank', field: 'Zbplbb', type: 'text' },
      { id: 'plSellerLoc', label: 'Seller Location', type: 'text' },
      { id: 'plOriginEntity', label: 'Origin Entity', field: 'Zoentity', type: 'text' },
    ],
  },
  {
    heading: 'Sales Leg',
    grid: 'grid3',
    fields: [
      { id: 'slContract', label: 'Sales Contract', field: 'ZconNum2', type: 'text' },
      { id: 'slIncoterms', label: 'Sales Incoterms', field: 'Zsalesinc', type: 'text' },
      { id: 'slPayTerms', label: 'Sales Pay Terms', field: 'Zptss', type: 'text' },
      { id: 'slSellerBank', label: 'Sales - Seller Bank', field: 'Zbslsb', type: 'text' },
      { id: 'slBuyerBank', label: 'Sales - Buyer Bank', field: 'Zbslbb', type: 'text' },
      { id: 'slBuyerLoc', label: 'Buyer Location', type: 'text' },
    ],
  },
]

export const STATUS_SECTIONS: readonly Section[] = [
  {
    heading: 'Status Details',
    grid: 'grid5',
    fields: [
      {
        id: 'stOgbsStatus',
        label: 'OGBS Status',
        field: 'ZogbsStatId',
        type: 'text',
        control: 'select',
      },
      // ZREMARK is the OGBS remark: the upload fills it from the workbook's "OGBS Remark" column.
      { id: 'stOgbsRemarks', label: 'OGBS Remarks', field: 'Zremark', type: 'text' },
    ],
  },
  {
    heading: 'Blocked-Allocated Status',
    grid: 'grid5',
    fields: [
      // SE11: ZFLW_COD2 "Blocked Status" (ZSGTSFTR_TF_STAT type 02: 11, 12, 14), its text in
      // ZFLW_STAS2 "Blocked Status Desc", written with the code on save.
      { id: 'stBlockedStatus', label: 'Blocked Status', field: 'ZflwCod2', type: 'text', control: 'select' },
      { id: 'stBlockedAmount', label: 'Amount', field: 'Zamt', type: 'number' },
      { id: 'stBlockedFrom', label: 'Blocked From', field: 'ZblkFrom', type: 'date' },
      { id: 'stBlockedTo', label: 'Blocked To', field: 'ZblkTo', type: 'date' },
      { id: 'stBlockedRemarks', label: 'Blocked Remarks', field: 'ZblkRemark', type: 'text' },
      // SE11 lists ZFO_TRADER ("Trader") among the blocking columns; ZTRADER is another field.
      { id: 'stTrader', label: 'Trader', field: 'ZfoTrader', type: 'text' },
      { id: 'stCpmtAmount', label: 'CPMT Amount', field: 'ZcpmAmt', type: 'number', readOnly: true },
      { id: 'stDealId', label: 'Deal ID', field: 'ZdealId', type: 'text', control: 'select' },
      { id: 'stOttkNo', label: 'OTTK No', field: 'ZottkNo', type: 'text', control: 'select' },
      { id: 'stDttkNo', label: 'DTTK No', field: 'ZdttkNo', type: 'text', control: 'select' },
    ],
  },
  {
    heading: 'TF Status Details',
    grid: 'grid5',
    fields: [
      // SE11: ZFLW_COD1 "TF Status" (ZSGTSFTR_TF_STAT type 01: 01, 03, 04), its text in
      // ZFLW_STAS1 "TF Status Desc", written with the code on save.
      { id: 'stTfStatus', label: 'TF Status', field: 'ZflwCod1', type: 'text', control: 'select' },
      { id: 'stTfExpired', label: 'Tradeflow Expired', field: 'ZtfExp', type: 'text' },
      { id: 'stTfDeleted', label: 'Tradeflow Deleted', field: 'ZtfDelete', type: 'text' },
      { id: 'stCreatedBy', label: 'Created By', field: 'ZcreatedBy', type: 'text', readOnly: true },
      { id: 'stCreatedDate', label: 'Created Date', field: 'ZcreatedDate', type: 'date', readOnly: true },
      { id: 'stCreatedTime', label: 'Created Time', field: 'ZcreatedTime', type: 'text', readOnly: true },
      { id: 'stChangedBy', label: 'Changed By', field: 'ZchangedBy', type: 'text', readOnly: true },
      { id: 'stChangedDate', label: 'Changed Date', field: 'ZchangedDate', type: 'date', readOnly: true },
      { id: 'stChangedTime', label: 'Changed Time', field: 'ZchangedTime', type: 'text', readOnly: true },
    ],
  },
]

/** Flattened per-tab views, used for save (which fields belong to the open tab). */
export const BASIC_FIELDS: readonly FieldDescriptor[] = BASIC_SECTIONS.flatMap((s) => s.fields)
export const SHIPPING_FIELDS: readonly FieldDescriptor[] = SHIPPING_SECTIONS.flatMap((s) => s.fields)
export const PURCH_SALES_FIELDS: readonly FieldDescriptor[] = PURCH_SALES_SECTIONS.flatMap(
  (s) => s.fields,
)
export const STATUS_FIELDS: readonly FieldDescriptor[] = STATUS_SECTIONS.flatMap((s) => s.fields)

/**
 * Exact, case-insensitive match on each non-empty filter; all must match. Exact rather than
 * substring because every filter is a dropdown whose options are the distinct values
 * already present in the loaded rows — there is nothing partial to type.
 */
export function filterRows(rows: readonly TrdFlowRow[], filters: TfFilters): TrdFlowRow[] {
  const active = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (active.length === 0) return [...rows]
  return rows.filter((row) =>
    active.every(([key, value]) => {
      const cell = row[key as keyof TrdFlowRow]
      if (cell === undefined || cell === null) return false
      return String(cell).toLowerCase() === value.trim().toLowerCase()
    }),
  )
}

/**
 * The distinct non-empty values of one field across the rows, sorted — the option list for
 * that field's dropdown. The legacy page filled these from DUMMY_MASTER_DATA; here they come
 * from the data actually loaded, so an option can never select an empty result.
 */
export function distinctValues(rows: readonly TrdFlowRow[], field: keyof TrdFlowRow): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = row[field]
    if (value === undefined || value === null || value === '') continue
    seen.add(String(value))
  }
  return [...seen].sort()
}

/** Sums the contract amount. Rows without one contribute nothing rather than NaN. */
export function subtotal(rows: readonly TrdFlowRow[]): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.Zttv) ? Number(row.Zttv) : 0), 0)
}

/** The composite key, or null when the row cannot address itself. */
export function rowKey(row: TrdFlowRow): TrdFlowKey | null {
  if (!row.ZtfNo || !row.ZtfSplit) return null
  return { ZtfNo: row.ZtfNo, ZtfSplit: row.ZtfSplit }
}

export type SortDirection = 'asc' | 'desc'

/**
 * Sorts rows by one column for the List of Trade Flows header click. A numeric column
 * compares numerically; everything else, including the ISO dates the rows carry, compares as
 * text (ISO sorts correctly lexically). A row missing the field always sorts last, in either
 * direction, rather than jumping to the top on 'desc'.
 */
export function sortRows(
  rows: readonly TrdFlowRow[],
  field: keyof TrdFlowRow,
  direction: SortDirection,
  kind?: 'num',
): TrdFlowRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    const aEmpty = av === undefined || av === null || av === ''
    const bEmpty = bv === undefined || bv === null || bv === ''
    if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1
    if (kind === 'num') return (Number(av) - Number(bv)) * sign
    return String(av).localeCompare(String(bv)) * sign
  })
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function finite(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * The popup's derived fields, recomputed when one of their inputs is edited, as the legacy
 * page's input listeners did:
 *   Contract Amount (ZTTV)     = Quantity x Contract Price (ZUNIT)
 *   CPMT Amount (ZCPM_AMT)     = Quantity x Current Market Price (ZCPRICE)
 *   Transit time (ZDAYS)       = ETA at POD - Sailing Date, in days ('' when negative)
 * Only the fields the edit feeds are touched, and nothing is changed while an input is not a
 * number or a date — a half-typed "12." still counts as 12, "abc" leaves the amount alone.
 */
export function withDerivedFields(draft: TrdFlowRow, changed: keyof TrdFlowRow): TrdFlowRow {
  const next: TrdFlowRow = { ...draft }
  const qty = finite(draft.Zquantity)
  if (changed === 'Zquantity' || changed === 'Zunit') {
    const price = finite(draft.Zunit)
    if (qty !== null && price !== null) next.Zttv = round2(qty * price)
  }
  if (changed === 'Zquantity' || changed === 'Zcprice') {
    const cmp = finite(draft.Zcprice)
    if (qty !== null && cmp !== null) next.ZcpmAmt = round2(qty * cmp)
  }
  if (changed === 'Zsldate' || changed === 'ZetaDsPort') {
    const sailing = Date.parse(String(draft.Zsldate ?? '').slice(0, 10))
    const eta = Date.parse(String(draft.ZetaDsPort ?? '').slice(0, 10))
    if (Number.isFinite(sailing) && Number.isFinite(eta)) {
      const days = Math.round((eta - sailing) / 86400000)
      next.Zdays = days >= 0 ? String(days) : ''
    }
  }
  return next
}

/**
 * CPMT Amount as the row is first opened, before any edit — Quantity x Current Market Price
 * (ZCPRICE), the same formula withDerivedFields applies on an edit. Needed because a trade flow
 * can be stored with ZCPM_AMT still 0 even though Quantity and Current Market Price are both
 * present (the value upstream never computed it); this keeps what's shown consistent with the
 * formula rather than trusting a stored figure that was never actually calculated. Only
 * ZCPM_AMT is touched — Contract Amount (ZTTV) is left exactly as stored.
 */
export function withCpmtAmount(row: TrdFlowRow): TrdFlowRow {
  const qty = finite(row.Zquantity)
  const cmp = finite(row.Zcprice)
  if (qty === null || cmp === null) return row
  return { ...row, ZcpmAmt: round2(qty * cmp) }
}
