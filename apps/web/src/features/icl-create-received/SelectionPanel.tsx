import { Calendar } from './Calendar.tsx'
import { ComboField } from './ComboField.tsx'
import type { CalendarTarget, FilterState } from './types.ts'

type SelectionPanelProps = {
  uptoRequestDate: string
  onUptoChange: (value: string) => void
  onUptoCommit: () => void
  calendarOpenFor: CalendarTarget | null
  onToggleCalendar: (target: CalendarTarget) => void
  onCalendarSelect: (target: CalendarTarget, formatted: string) => void
  onCalendarClear: (target: CalendarTarget) => void
  filterOpen: boolean
  onToggleFilterBody: () => void
  filters: FilterState
  onFilterChange: (key: keyof FilterState, value: string) => void
  onPlannedDateCommit: () => void
  openCombo: keyof FilterState | null
  onComboFocus: (field: keyof FilterState) => void
  onComboToggle: (field: keyof FilterState) => void
  onComboChoose: (field: keyof FilterState, value: string) => void
  comboValuesFor: (field: keyof FilterState) => string[]
  onClearFilters: () => void
}

/** The date/filter panel above the results (`.selection-panel` in the original). */
export function SelectionPanel({
  uptoRequestDate,
  onUptoChange,
  onUptoCommit,
  calendarOpenFor,
  onToggleCalendar,
  onCalendarSelect,
  onCalendarClear,
  filterOpen,
  onToggleFilterBody,
  filters,
  onFilterChange,
  onPlannedDateCommit,
  openCombo,
  onComboFocus,
  onComboToggle,
  onComboChoose,
  comboValuesFor,
  onClearFilters,
}: SelectionPanelProps) {
  return (
    <div className="selection-panel">
      <div className="selection-row">
        <div className="main-date-item">
          <label htmlFor="uptoRequestDate">Upto Request Date<span className="req">*</span></label>
          <div className="inline-date-shell" onClick={(e) => e.stopPropagation()}>
            <input
              id="uptoRequestDate"
              className="inline-date-input"
              type="text"
              placeholder="DD-MM-YYYY"
              value={uptoRequestDate}
              onChange={(e) => onUptoChange(e.target.value)}
              onBlur={onUptoCommit}
            />
            <button
              id="uptoCalendarBtn"
              className="inline-calendar-btn"
              type="button"
              aria-label="Open calendar"
              onClick={() => onToggleCalendar('uptoRequestDate')}
            />
            {calendarOpenFor === 'uptoRequestDate' && (
              <Calendar
                value={uptoRequestDate}
                onSelect={(formatted) => onCalendarSelect('uptoRequestDate', formatted)}
                onClear={() => onCalendarClear('uptoRequestDate')}
                onClose={() => onToggleCalendar('uptoRequestDate')}
              />
            )}
          </div>
        </div>
        <button
          id="filterToggle"
          className="filter-icon-btn"
          type="button"
          title="Filters"
          aria-label="Filters"
          onClick={onToggleFilterBody}
        />
        <div id="filterBody" className={'filter-body' + (filterOpen ? ' open' : '')}>
          <div className="filter-grid">
            <ComboField
              id="givenTxnFilter"
              label="ICL Given Txn No"
              shellClassName="filter-txn"
              value={filters.givenTxn}
              values={comboValuesFor('givenTxn')}
              open={openCombo === 'givenTxn'}
              onChange={(v) => onFilterChange('givenTxn', v)}
              onFocus={() => onComboFocus('givenTxn')}
              onToggle={() => onComboToggle('givenTxn')}
              onChoose={(v) => onComboChoose('givenTxn', v)}
            />
            <ComboField
              id="requestFilter"
              label="ICL Request No"
              shellClassName="filter-request"
              value={filters.requestNo}
              values={comboValuesFor('requestNo')}
              open={openCombo === 'requestNo'}
              onChange={(v) => onFilterChange('requestNo', v)}
              onFocus={() => onComboFocus('requestNo')}
              onToggle={() => onComboToggle('requestNo')}
              onChoose={(v) => onComboChoose('requestNo', v)}
            />
            <ComboField
              id="entityFilter"
              label="Entity ID"
              shellClassName="filter-entity"
              value={filters.entity}
              values={comboValuesFor('entity')}
              open={openCombo === 'entity'}
              onChange={(v) => onFilterChange('entity', v)}
              onFocus={() => onComboFocus('entity')}
              onToggle={() => onComboToggle('entity')}
              onChoose={(v) => onComboChoose('entity', v)}
            />
            <ComboField
              id="ottkFilter"
              label="OTTK No"
              shellClassName="filter-ottk"
              value={filters.ottk}
              values={comboValuesFor('ottk')}
              open={openCombo === 'ottk'}
              onChange={(v) => onFilterChange('ottk', v)}
              onFocus={() => onComboFocus('ottk')}
              onToggle={() => onComboToggle('ottk')}
              onChoose={(v) => onComboChoose('ottk', v)}
            />
            <div className="filter-item">
              <label htmlFor="plannedDateFilter">Planned End Date</label>
              <div className="inline-date-shell filter-date" onClick={(e) => e.stopPropagation()}>
                <input
                  id="plannedDateFilter"
                  className="inline-date-input filter-date"
                  type="text"
                  placeholder="DD-MM-YYYY"
                  value={filters.plannedDate}
                  onChange={(e) => onFilterChange('plannedDate', e.target.value)}
                  onBlur={onPlannedDateCommit}
                />
                <button
                  id="plannedCalendarBtn"
                  className="inline-calendar-btn"
                  type="button"
                  aria-label="Open calendar"
                  onClick={() => onToggleCalendar('plannedDateFilter')}
                />
                {calendarOpenFor === 'plannedDateFilter' && (
                  <Calendar
                    value={filters.plannedDate}
                    onSelect={(formatted) => onCalendarSelect('plannedDateFilter', formatted)}
                    onClear={() => onCalendarClear('plannedDateFilter')}
                    onClose={() => onToggleCalendar('plannedDateFilter')}
                  />
                )}
              </div>
            </div>
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
