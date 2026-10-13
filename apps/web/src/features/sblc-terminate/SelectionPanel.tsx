import { CalendarPopup } from './CalendarPopup.tsx'
import { ADDITIONAL_SELECTIONS, REQUEST_TYPES } from './data.ts'
import { FILTER_KEY_BY_COMBO, transactionValues, type ComboId, type Filters } from './logic.ts'
import type { SblcRow } from './types.ts'

export type SelectionPanelProps = {
  companyCode: string
  onCompanyChange: (value: string) => void
  onCompanyCommit: () => void
  onOpenCompanyModal: () => void
  keyDate: string
  onKeyDateChange: (value: string) => void
  onKeyDateBlur: () => void
  onKeyDateCalendarSelect: (value: string) => void
  keyDateCalendarOpen: boolean
  onToggleKeyDateCalendar: () => void
  onCloseKeyDateCalendar: () => void
  filterOpen: boolean
  onToggleFilter: () => void
  filters: Filters
  onFilterChange: (key: keyof Filters, value: string) => void
  onClearFilters: () => void
  activeCombo: ComboId | ''
  onOpenCombo: (id: ComboId) => void
  onCloseCombo: () => void
  onChooseCombo: (id: ComboId, value: string) => void
  rows: SblcRow[]
}

function comboValuesFor(id: ComboId, rows: SblcRow[], companyCode: string, filters: Filters): string[] {
  if (id === 'transactionFilter') return transactionValues(rows, companyCode, filters.transaction)
  if (id === 'requestTypeFilter') {
    const q = filters.requestType.toLowerCase()
    return REQUEST_TYPES.filter((v) => !q || v.toLowerCase().includes(q))
  }
  return ADDITIONAL_SELECTIONS
}

function ComboField({
  id,
  label,
  className,
  readOnly,
  filters,
  onFilterChange,
  activeCombo,
  onOpenCombo,
  onCloseCombo,
  onChooseCombo,
  rows,
  companyCode,
}: {
  id: ComboId
  label: string
  className: string
  readOnly?: boolean | undefined
  filters: Filters
  onFilterChange: (key: keyof Filters, value: string) => void
  activeCombo: ComboId | ''
  onOpenCombo: (id: ComboId) => void
  onCloseCombo: () => void
  onChooseCombo: (id: ComboId, value: string) => void
  rows: SblcRow[]
  companyCode: string
}) {
  const key = FILTER_KEY_BY_COMBO[id]
  const value = filters[key]
  const open = activeCombo === id
  const values = open ? comboValuesFor(id, rows, companyCode, filters) : []
  const listId = id + 'List'
  return (
    <div className="filter-item">
      <label htmlFor={id}>{label}</label>
      <div className={'combo-shell ' + className}>
        <input
          id={id}
          className="filter-input combo-input"
          type="text"
          autoComplete="off"
          readOnly={readOnly}
          value={value}
          onChange={(e) => onFilterChange(key, e.target.value)}
          onFocus={() => onOpenCombo(id)}
        />
        <button
          className="combo-btn"
          type="button"
          aria-label={`Show ${label.toLowerCase()} values`}
          onClick={(e) => {
            e.stopPropagation()
            if (open) onCloseCombo()
            else onOpenCombo(id)
          }}
        />
        <div id={listId} className={'combo-list' + (open ? ' open' : '')}>
          {open &&
            (values.length ? (
              values.map((v) => (
                <button key={v} className="combo-option" type="button" onClick={() => onChooseCombo(id, v)}>
                  {v}
                </button>
              ))
            ) : (
              <div className="combo-empty">No matching values</div>
            ))}
        </div>
      </div>
    </div>
  )
}

export function SelectionPanel(props: SelectionPanelProps) {
  const {
    companyCode,
    onCompanyChange,
    onCompanyCommit,
    onOpenCompanyModal,
    keyDate,
    onKeyDateChange,
    onKeyDateBlur,
    onKeyDateCalendarSelect,
    keyDateCalendarOpen,
    onToggleKeyDateCalendar,
    onCloseKeyDateCalendar,
    filterOpen,
    onToggleFilter,
    filters,
    onFilterChange,
    onClearFilters,
    activeCombo,
    onOpenCombo,
    onCloseCombo,
    onChooseCombo,
    rows,
  } = props

  return (
    <div className="selection-panel">
      <div className="selection-row">
        <div className="main-field-item">
          <label htmlFor="companyCode">Company Code<span className="req">*</span></label>
          <div className="field-shell company-shell">
            <input
              id="companyCode"
              className="main-input"
              type="text"
              maxLength={4}
              autoComplete="off"
              placeholder="Select company"
              value={companyCode}
              onChange={(e) => onCompanyChange(e.target.value)}
              onBlur={onCompanyCommit}
            />
            <button
              id="companyHelpBtn"
              className="search-btn"
              type="button"
              aria-label="Company code search help"
              onClick={onOpenCompanyModal}
            />
          </div>
        </div>
        <div className="main-field-item">
          <label htmlFor="keyDate">Key Date<span className="req">*</span></label>
          <div className="field-shell date-shell">
            <input
              id="keyDate"
              className="main-input"
              type="text"
              placeholder="DD-MM-YYYY"
              autoComplete="off"
              value={keyDate}
              onChange={(e) => onKeyDateChange(e.target.value)}
              onBlur={onKeyDateBlur}
            />
            <button
              id="keyDateCalendarBtn"
              className="calendar-btn"
              type="button"
              aria-label="Open key date calendar"
              onClick={onToggleKeyDateCalendar}
            />
            {keyDateCalendarOpen ? (
              <CalendarPopup id="keyDateCalendar" value={keyDate} onSelect={onKeyDateCalendarSelect} onClose={onCloseKeyDateCalendar} />
            ) : (
              <div id="keyDateCalendar" className="calendar-popup" />
            )}
          </div>
        </div>
        <button
          id="filterToggle"
          className="filter-icon-btn"
          type="button"
          title="Optional filters"
          aria-label="Optional filters"
          onClick={onToggleFilter}
        />
        <div id="filterBody" className={'filter-body' + (filterOpen ? ' open' : '')}>
          <div className="filter-grid">
            <ComboField
              id="transactionFilter"
              label="Transaction No"
              className="filter-txn"
              filters={filters}
              onFilterChange={onFilterChange}
              activeCombo={activeCombo}
              onOpenCombo={onOpenCombo}
              onCloseCombo={onCloseCombo}
              onChooseCombo={onChooseCombo}
              rows={rows}
              companyCode={companyCode}
            />
            <ComboField
              id="requestTypeFilter"
              label="SBLC Request Type"
              className="filter-type"
              filters={filters}
              onFilterChange={onFilterChange}
              activeCombo={activeCombo}
              onOpenCombo={onOpenCombo}
              onCloseCombo={onCloseCombo}
              onChooseCombo={onChooseCombo}
              rows={rows}
              companyCode={companyCode}
            />
            <ComboField
              id="terminationFilter"
              label="Additional Selection"
              className="filter-state"
              readOnly
              filters={filters}
              onFilterChange={onFilterChange}
              activeCombo={activeCombo}
              onOpenCombo={onOpenCombo}
              onCloseCombo={onCloseCombo}
              onChooseCombo={onChooseCombo}
              rows={rows}
              companyCode={companyCode}
            />
            <div className="filter-item">
              <label>&nbsp;</label>
              <button id="clearFilters" className="btn btn-ghost" type="button" onClick={onClearFilters}>
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
