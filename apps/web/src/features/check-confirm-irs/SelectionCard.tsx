import { useRef } from 'react'
import { CalendarPopup } from './CalendarPopup.tsx'
import { ComboField } from './ComboField.tsx'
import type { ComboKind, IrsStatus } from './types.ts'

export type CompanyOption = { code: string; name: string }

export type SelectionCardProps = {
  companies: CompanyOption[]
  companyCode: string
  onCompanyChange(code: string): void

  keyDate: string
  onKeyDateChange(value: string): void
  onKeyDateCommit(): void

  calendarOpen: boolean
  onCalendarToggle(): void
  onCalendarPickDate(date: string): void
  onCalendarClose(): void

  filterOpen: boolean
  onFilterToggle(): void

  transactionFilter: string
  dealFilter: string
  statusFilter: string
  statuses: readonly IrsStatus[]
  onTransactionChange(value: string): void
  onDealChange(value: string): void
  onStatusChange(code: string): void
  onClearFilters(): void

  openCombo: ComboKind | null
  transactionOptions: string[]
  dealOptions: string[]
  onComboFocus(kind: ComboKind): void
  onComboToggle(kind: ComboKind): void
  onComboPick(kind: ComboKind, value: string): void
}

export function SelectionCard(props: SelectionCardProps) {
  const dateShellRef = useRef<HTMLDivElement>(null)
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Basic Selection</div>
      </div>
      <div className="card-body">
        <div className="selection-main-row">
          <div className="field-inline">
            <label htmlFor="companyCode">
              Company Code <span className="required">*</span>
            </label>
            <select
              id="companyCode"
              className="select company-select"
              required
              value={props.companyCode}
              onChange={(event) => props.onCompanyChange(event.target.value)}
            >
              <option value="">Select Company Code</option>
              {props.companies.map((company) => (
                <option key={company.code} value={company.code}>
                  {company.code} - {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-inline">
            <label htmlFor="keyDate">
              Key Date <span className="required">*</span>
            </label>
            <div className="date-shell" ref={dateShellRef}>
              <input
                id="keyDate"
                className="input date-input"
                type="text"
                placeholder="DD-MM-YYYY"
                required
                value={props.keyDate}
                onChange={(event) => {
                  props.onKeyDateChange(event.target.value)
                  if (event.target.value.length === 10) props.onKeyDateCommit()
                }}
                onBlur={props.onKeyDateCommit}
              />
              <button
                id="calendarBtn"
                className="calendar-btn"
                type="button"
                title="Open calendar"
                onClick={props.onCalendarToggle}
              ></button>
              <CalendarPopup
                open={props.calendarOpen}
                anchorRef={dateShellRef}
                value={props.keyDate}
                onPickDate={props.onCalendarPickDate}
                onClose={props.onCalendarClose}
              />
            </div>
          </div>
          <button
            id="filterToggle"
            className="filter-icon-btn"
            type="button"
            title="Filters"
            aria-label="Filters"
            onClick={props.onFilterToggle}
          ></button>
          <div className={props.filterOpen ? 'filter-body open' : 'filter-body'}>
            <div className="filter-grid">
              <ComboField
                id="transactionFilter"
                label="Transaction No"
                placeholder="Transaction No"
                value={props.transactionFilter}
                open={props.openCombo === 'txn'}
                options={props.transactionOptions}
                onChange={props.onTransactionChange}
                onFocus={() => props.onComboFocus('txn')}
                onToggle={() => props.onComboToggle('txn')}
                onPick={(value) => props.onComboPick('txn', value)}
              />
              <ComboField
                id="dealFilter"
                label="Deal ID"
                placeholder="Deal ID"
                value={props.dealFilter}
                open={props.openCombo === 'deal'}
                options={props.dealOptions}
                onChange={props.onDealChange}
                onFocus={() => props.onComboFocus('deal')}
                onToggle={() => props.onComboToggle('deal')}
                onPick={(value) => props.onComboPick('deal', value)}
              />
              <div className="filter-item">
                <label htmlFor="statusFilter">Status Selection</label>
                <select
                  id="statusFilter"
                  className="select status-filter"
                  value={props.statusFilter}
                  onChange={(event) => props.onStatusChange(event.target.value)}
                >
                  {props.statuses.map((status) => (
                    <option key={status.code} value={status.code}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <button
                  id="clearFilters"
                  className="btn btn-ghost"
                  type="button"
                  onClick={props.onClearFilters}
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
