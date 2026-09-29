/** COMP's ZREG_ID (R01…) against MySQL; the seed data's APAC/EMEA/AMER otherwise. */
export type RegionId = string
export type Currency = string
export type ModelType = 'FORWARD' | 'OPTION'
export type StatusCode = '01' | '02'
/** SAP's boolean: 'X' is set, blank is not. */
export type Flag = 'X' | ''

export type Region = { id: RegionId; desc: string }
export type Entity = { id: string; name: string; region: RegionId; currency: Currency }
export type FxModel = { id: string; desc: string; type: ModelType }
export type Status = { code: StatusCode; desc: string }

/** One row of the report, with the original's ZSGTSF field names. */
export type Deal = {
  zdeal_type: ModelType
  zsub_type: string
  zdeal_id: string
  zdeal_desc: string
  zs_date: Date
  ze_date: Date
  zrev_dedate: Date | null
  zmc_ref: string
  zdeal_stat: StatusCode
  zdeal_sdesc: string
  zconfirm: Flag
  zss: Flag
  zship_start: Date
  zship_end: Date
  zpl: number
  zpl_curr: Currency
  zpl_rate: number
  zpl_lamt: number
  zpl_lcurr: Currency
  zcreated_by: string
  zcreated_date: Date
  zcreated_time: string
  zchanged_by: string
  zchanged_date: Date
  zchanged_time: string
  zorigin: string
  zreg_id: RegionId
  zmod_id: string
  zmod_desc: string
  zmc_desc: string
  zmc_date: Date
  zamt: number
  uti_amt: number
}

export type ColumnKey = keyof Deal

export type ColumnType =
  | 'hotspot-green'
  | 'hotspot-blue'
  | 'text'
  | 'desc'
  | 'status'
  | 'flag'
  | 'date'
  | 'currency-blue'
  | 'currency-green'
  | 'pl'
  | 'rate'

export type Column = {
  key: ColumnKey
  label: string
  essential: boolean
  type: ColumnType
  sortable: boolean
  width?: number
}

export type Layout = 'essential' | 'all'
export type SortDir = 'asc' | 'desc'
export type Sort = { key: ColumnKey; dir: SortDir }

/** The Basic Selection: empty lists / blank status mean "no restriction". */
export type Filters = { region: string[]; entity: string[]; model: string[]; status: StatusCode | '' }
export type MultiFilterKey = 'region' | 'entity' | 'model'

export type QuickFilters = { confirmedOnly: boolean; straddleOnly: boolean; revisedOnly: boolean }

export type ViewState = {
  keyDate: Date
  filters: Filters
  quickFilters: QuickFilters
  search: string
  sort: Sort
  layout: Layout
}

export type MselOption = { id: string; label: string; sub?: string }
