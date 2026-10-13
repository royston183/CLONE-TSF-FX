import { DateField } from './DateField.tsx'

export type OpenCalendar = 'upto' | 'start' | null

export type FilterPanelProps = {
  uptoRequestDate: string
  onUptoChange: (value: string) => void
  onUptoCommit: (value: string) => void
  filterOpen: boolean
  onFilterToggle: () => void
  openCalendar: OpenCalendar
  onCalendarToggle: (which: OpenCalendar) => void
  requestType: string
  onRequestTypeChange: (value: string) => void
  requestFrom: string
  onRequestFromChange: (value: string) => void
  startFrom: string
  onStartFromChange: (value: string) => void
  onStartFromCommit: (value: string) => void
  onClearFilters: () => void
}

/** The date + filter-icon row and its collapsible filter grid. */
export function FilterPanel({
  uptoRequestDate,
  onUptoChange,
  onUptoCommit,
  filterOpen,
  onFilterToggle,
  openCalendar,
  onCalendarToggle,
  requestType,
  onRequestTypeChange,
  requestFrom,
  onRequestFromChange,
  startFrom,
  onStartFromChange,
  onStartFromCommit,
  onClearFilters,
}: FilterPanelProps) {
  return (
    <div className="selection-panel">
      <div className="selection-main-row">
        <div className="main-date-item">
          <label htmlFor="uptoRequestDate">Upto Request Date<span className="req">*</span></label>
          <DateField
            id="uptoRequestDate"
            value={uptoRequestDate}
            onChange={onUptoChange}
            onCommit={onUptoCommit}
            open={openCalendar === 'upto'}
            onToggle={() => onCalendarToggle(openCalendar === 'upto' ? null : 'upto')}
            onClose={() => onCalendarToggle(null)}
          />
        </div>
        <button
          className="filter-icon-btn filter-row-btn"
          type="button"
          title="Filters"
          aria-label="Filters"
          onClick={onFilterToggle}
        />
        <div className={filterOpen ? 'filter-body open' : 'filter-body'}>
          <div className="filter-grid">
            <div className="filter-item">
              <label htmlFor="requestTypeFilter">Select Type of Requests</label>
              <select
                id="requestTypeFilter"
                className="filter-select"
                value={requestType}
                onChange={(event) => onRequestTypeChange(event.target.value)}
              >
                <option value="Pending">Pending Requests</option>
                <option value="Issued">Issued Requests</option>
              </select>
            </div>
            <div className="filter-item">
              <label htmlFor="requestFrom">Request No</label>
              <input
                id="requestFrom"
                className="filter-input filter-request"
                type="text"
                placeholder="Request No"
                value={requestFrom}
                onChange={(event) => onRequestFromChange(event.target.value)}
              />
            </div>
            <div className="filter-item">
              <label htmlFor="startFrom">Start Date</label>
              <DateField
                id="startFrom"
                value={startFrom}
                onChange={onStartFromChange}
                onCommit={onStartFromCommit}
                open={openCalendar === 'start'}
                onToggle={() => onCalendarToggle(openCalendar === 'start' ? null : 'start')}
                onClose={() => onCalendarToggle(null)}
                shellClassName="filter-date-shell"
                inputClassName="filter-date-input"
              />
            </div>
            <div className="filter-item">
              <label>&nbsp;</label>
              <button className="btn btn-ghost" type="button" onClick={onClearFilters}>
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
