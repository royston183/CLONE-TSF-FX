import { useState } from 'react'
import { fmtDate, fmtNum } from '@slc/api-client'
import { DateField } from './DateField.tsx'
import { distinctValues, filterRows, rowKey, sortRows, subtotal } from './fields.ts'
import type { SortDirection } from './fields.ts'
import type { SelectOption } from './masters.ts'
import type { TfFilters, TrdFlowRow } from './types.ts'

/**
 * The legacy #tfTable columns in their original order. `kind` drives formatting only; the
 * header text is copied from the original thead verbatim.
 */
const COLUMNS: ReadonlyArray<{ label: string; field: keyof TrdFlowRow; kind?: 'date' | 'num' }> = [
  { label: 'Trade Flow ID', field: 'ZtfNo' },
  { label: 'TF Split ID', field: 'ZtfSplit' },
  { label: 'TF Upload Date', field: 'ZtfDate', kind: 'date' },
  { label: 'Business Unit Name', field: 'Zbu' },
  { label: 'Operator', field: 'Zoprtr' },
  { label: 'BL-Vessel Name', field: 'ZblVsslName' },
  { label: 'BU Commodity', field: 'Zcmmd' },
  { label: 'P - Contract Number', field: 'ZconNum1' },
  { label: 'Purchase Incoterms', field: 'ZpurInc' },
  { label: 'Payment terms - Purchase Side', field: 'Zpaypur' },
  { label: 'Banks-Purchase Leg-Seller Bank', field: 'Zbplsb' },
  { label: 'Banks-Purchase Leg-Buyer Bank', field: 'Zbplbb' },
  { label: 'S Contract Number', field: 'ZconNum2' },
  { label: 'Sales Incoterms', field: 'Zsalesinc' },
  { label: 'Payment terms - Sales Side', field: 'Zptss' },
  { label: 'Banks-Sale Leg-Seller Bank', field: 'Zbslsb' },
  { label: 'Banks-Sale Leg-Buyer Bank', field: 'Zbslbb' },
  { label: 'OGA Title From - Date', field: 'Zotfd', kind: 'date' },
  { label: 'OGA Title Till - Date', field: 'Zottd', kind: 'date' },
  { label: 'Quantity', field: 'Zquantity', kind: 'num' },
  // ZUNIT is SE11's "Contract Price" and ZCPRICE the CMP — the names mislead; the upload maps
  // them the same way, and Contract Amt = Quantity x ZUNIT.
  { label: 'Contract Price (USD)', field: 'Zunit', kind: 'num' },
  { label: 'CMP (MT)', field: 'Zcprice', kind: 'num' },
  { label: 'Contract Amt(USD)', field: 'Zttv', kind: 'num' },
  { label: 'Port of Loading', field: 'Zpol' },
  { label: 'Port of Destination', field: 'Zpod' },
  { label: 'Sailing Date', field: 'Zsldate', kind: 'date' },
  { label: 'BL Number', field: 'Zblno' },
  { label: 'Number of Days', field: 'Zdays' },
  { label: 'ETA at Discharge Port', field: 'ZetaDsPort', kind: 'date' },
]

/** The legacy filter dropdowns, each with the TrdFlow field it filters. */
const FILTERS: ReadonlyArray<{ id: string; key: keyof TfFilters; all: string }> = [
  { id: 'filterBu', key: 'Zbu', all: 'All BU' },
  { id: 'filterCommodity', key: 'Zcmmd', all: 'All Commodities' },
  { id: 'filterTfStatus', key: 'ZflwCod1', all: 'All TF Status' },
  { id: 'filterOgbsStatus', key: 'ZogbsStatId', all: 'All OGBS Status' },
  { id: 'filterBlockedStatus', key: 'ZflwCod2', all: 'All Blocked Status' },
]

function cell(row: TrdFlowRow, col: (typeof COLUMNS)[number]): string {
  const raw = row[col.field]
  if (raw === undefined || raw === null || raw === '') return ''
  if (col.kind === 'date') return fmtDate(String(raw))
  if (col.kind === 'num') return fmtNum(Number(raw))
  return String(raw)
}

export type TfTableProps = {
  rows: readonly TrdFlowRow[]
  filters: TfFilters
  onFiltersChange: (filters: TfFilters) => void
  showFilters: boolean
  onToggleFilters: () => void
  onClearFilters: () => void
  keyDate: string
  onKeyDateChange: (value: string) => void
  selected: TrdFlowRow | null
  onSelect: (row: TrdFlowRow) => void
  /**
   * The choices of the status filters, from ZSGTSFTR_TF_STAT (masters.ts). A filter without an
   * entry here lists the values the loaded rows carry.
   */
  filterOptions: Partial<Record<keyof TfFilters, readonly SelectOption[]>>
}

export function TfTable({
  rows,
  filters,
  onFiltersChange,
  showFilters,
  onToggleFilters,
  onClearFilters,
  keyDate,
  onKeyDateChange,
  selected,
  onSelect,
  filterOptions,
}: TfTableProps) {
  const [sort, setSort] = useState<{ field: keyof TrdFlowRow; dir: SortDirection } | null>(null)
  const filtered = filterRows(rows, filters)
  const sortColumn = sort ? COLUMNS.find((col) => col.field === sort.field) : undefined
  const visible = sort
    ? sortRows(filtered, sort.field, sort.dir, sortColumn?.kind === 'num' ? 'num' : undefined)
    : filtered
  const selectedKey = selected ? rowKey(selected) : null

  function toggleSort(field: keyof TrdFlowRow) {
    setSort((current) =>
      current && current.field === field
        ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
    )
  }

  return (
    <section className="ds-panel">
      <div className="panel-title">List of Trade Flows</div>

      <div className="toolstrip filters-bar" id="mainFiltersRow">
        <div className={showFilters ? 'filters-controls' : 'filters-controls hidden'}>
          <span className="field-hint filter-by-label">Filter by</span>
          <div className="ws-field">
            <DateField id="mainKeyDate" iso={keyDate} title="Key Date" onChange={onKeyDateChange} />
          </div>
          {FILTERS.map((filter) => (
            <select
              key={filter.id}
              id={filter.id}
              value={filters[filter.key]}
              onChange={(event) =>
                onFiltersChange({ ...filters, [filter.key]: event.target.value })
              }
            >
              <option value="">{filter.all}</option>
              {(filterOptions[filter.key] ?? distinctValues(rows, filter.key as keyof TrdFlowRow).map((value) => ({ value, label: value }))).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
          {/* No TrdFlow field behind these two, so they stay visible but inert. */}
          <label className="field-check main-filter-check">
            <input type="checkbox" id="filterIncludeExpired" style={{ width: 'auto' }} disabled />
            Include Expired TFs
          </label>
          <label className="field-check main-filter-check">
            <input type="checkbox" id="filterIncludeDeleted" style={{ width: 'auto' }} disabled />
            Include Deleted TFs
          </label>
          <button type="button" className="hdr-btn" id="btnClearMainFilters" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
        <button
          type="button"
          className="hdr-btn icon-btn filter-toggle-btn"
          id="btnToggleMainFilters"
          title="Filters"
          onClick={onToggleFilters}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 3h12l-4.5 5.2v3.6l-3 1.4V8.2z" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="table-scroll">
        {/* The original pins this at min-width:4200px, which leaves most columns empty and
            forces a long horizontal scroll. Dropped so the columns size to their content;
            the stylesheet's own 1400px floor on .data-table still applies. This is a
            deliberate departure from the original, asked for explicitly. */}
        <table className="data-table" id="tfTable">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = sort?.field === col.field
                return (
                  <th
                    key={col.field}
                    className={col.kind === 'num' ? 'num' : undefined}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Click to sort"
                    onClick={() => toggleSort(col.field)}
                  >
                    {col.label}
                    {active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody id="tfTableBody">
            {visible.map((row) => {
              const key = rowKey(row)
              const id = key ? `${key.ZtfNo}-${key.ZtfSplit}` : ''
              const isSelected =
                key !== null &&
                selectedKey !== null &&
                key.ZtfNo === selectedKey.ZtfNo &&
                key.ZtfSplit === selectedKey.ZtfSplit
              return (
                <tr
                  key={id}
                  className={isSelected ? 'row-selected' : undefined}
                  onClick={() => onSelect(row)}
                >
                  {COLUMNS.map((col) => (
                    <td key={col.field} className={col.kind === 'num' ? 'num' : undefined}>
                      {cell(row, col)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="toolstrip">
        <span className="field-hint">
          Showing {visible.length} of {rows.length}
        </span>
        <span className="field-hint">Contract Amt subtotal: {fmtNum(subtotal(visible))}</span>
      </div>
    </section>
  )
}
