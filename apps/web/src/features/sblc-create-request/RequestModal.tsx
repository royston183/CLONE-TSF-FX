import { useRef } from 'react'
import { REQUEST_COLUMNS, REQUEST_TYPES } from './data.ts'
import { money, parseAmountValue } from './format.ts'
import { RequestCalendar } from './RequestCalendar.tsx'
import type {
  CalendarState,
  DateField,
  DraftTextField,
  RequestColumnKey,
  RequestDraft,
  SblcRecord,
} from './types.ts'

/** The columns requiredFieldsMissing() checks before a request line can be created. */
const REQUIRED_COLUMNS: ReadonlySet<RequestColumnKey> = new Set([
  'startDate',
  'endDate',
  'expEndDate',
  'amount',
  'companyCode',
])

type RequestModalProps = {
  open: boolean
  record: SblcRecord | null
  drafts: readonly RequestDraft[]
  calendar: CalendarState | null
  onClose: () => void
  onAddRow: () => void
  onFieldChange: (rowId: string, field: DraftTextField, value: string) => void
  onAmountConvert: (rowId: string, value: string) => void
  onTypeChange: (rowId: string, requestType: string) => void
  onCreateRequest: (rowId: string) => void
  onOpenCalendar: (rowId: string, field: DateField) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToggleMode: () => void
  onPickYear: (year: number) => void
  onPickMonth: (month: number) => void
  onPickDay: (dateText: string) => void
  onClearDate: () => void
  onToday: () => void
}

/**
 * "Create SBLC Request" modal: the selected record's basic details, plus the editable
 * request lines. Only one line's amount input is allowed to fire the Enter-to-convert
 * shorthand at a time — the original keyed that off the DOM event target, which the row id
 * plus field name reproduces here.
 */
export function RequestModal({
  open,
  record,
  drafts,
  calendar,
  onClose,
  onAddRow,
  onFieldChange,
  onAmountConvert,
  onTypeChange,
  onCreateRequest,
  onOpenCalendar,
  onPrevMonth,
  onNextMonth,
  onToggleMode,
  onPickYear,
  onPickMonth,
  onPickDay,
  onClearDate,
  onToday,
}: RequestModalProps) {
  const anchorRefs = useRef(new Map<string, HTMLButtonElement>())

  if (!record) return null

  const openAnchor = calendar
    ? (anchorRefs.current.get(`${calendar.rowId}:${calendar.field}`) ?? null)
    : null

  return (
    <div id="requestModal" className={open ? 'modal-bg open' : 'modal-bg'}>
      <div className="request-modal">
        <div className="modal-head">
          <div className="modal-title">Create SBLC Request</div>
          <button id="requestClose" className="modal-close" type="button" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Basic Details</div>
            </div>
            <div id="basicDetails" className="card-body basic-grid">
              <div className="basic-item">
                <div className="basic-label">OTTK No</div>
                <div className="basic-value">{record.ottkNo}</div>
              </div>
              <div className="basic-item">
                <div className="basic-label">Company Code</div>
                <div className="basic-value">{record.companyCode}</div>
                <div className="basic-name">{record.companyName}</div>
              </div>
              <div className="basic-item">
                <div className="basic-label">Business Area</div>
                <div className="basic-value">{record.businessArea}</div>
                <div className="basic-name">{record.businessAreaName}</div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="request-head-left">
                <div className="card-title">Create SBLC Request</div>
                <button
                  id="requestAddRow"
                  className="request-add-btn"
                  type="button"
                  title="Add request line"
                  onClick={onAddRow}
                >
                  +
                </button>
              </div>
              <div id="requestMeta" className="card-meta">
                {drafts.length} request line{drafts.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="table-wrap">
              <table id="requestTable" className="request-table">
                <thead id="requestHead">
                  <tr>
                    {REQUEST_COLUMNS.map((column) => (
                      <th key={column.key} style={{ width: `${column.width}px` }}>
                        {column.label}
                        {REQUIRED_COLUMNS.has(column.key) ? (
                          <>
                            {' '}
                            <span className="required">*</span>
                          </>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody id="requestBody">
                  {drafts.map((row) => {
                    const disabled = !!row.requestNo
                    return (
                      <tr key={row.id} data-request-row={row.id}>
                        {REQUEST_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            className={column.type === 'number' ? 'number' : ''}
                          >
                            {column.type === 'date' ? (
                              <DateCell
                                row={row}
                                field={column.key as DateField}
                                disabled={disabled}
                                anchorRefs={anchorRefs}
                                calendar={calendar}
                                onOpenCalendar={onOpenCalendar}
                                onFieldChange={onFieldChange}
                                openAnchor={openAnchor}
                                onPrevMonth={onPrevMonth}
                                onNextMonth={onNextMonth}
                                onToggleMode={onToggleMode}
                                onPickYear={onPickYear}
                                onPickMonth={onPickMonth}
                                onPickDay={onPickDay}
                                onClearDate={onClearDate}
                                onToday={onToday}
                              />
                            ) : column.key === 'amount' ? (
                              <input
                                className="request-input request-amount"
                                data-row-id={row.id}
                                data-request-field="amount"
                                type="text"
                                value={row.amount === '' ? '' : money(row.amount)}
                                placeholder="Enter amount"
                                disabled={disabled}
                                onChange={(event) => onFieldChange(row.id, 'amount', event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter') return
                                  event.preventDefault()
                                  onAmountConvert(row.id, event.currentTarget.value)
                                }}
                              />
                            ) : column.type === 'number' ? (
                              money(row[column.key as 'amount'])
                            ) : column.type === 'requestType' ? (
                              <select
                                className="request-select"
                                data-request-type={row.id}
                                disabled={disabled}
                                value={row.requestType}
                                onChange={(event) => onTypeChange(row.id, event.target.value)}
                              >
                                {REQUEST_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            ) : column.type === 'action' ? (
                              <button
                                className="btn inline-create"
                                data-create-row={row.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => onCreateRequest(row.id)}
                              >
                                Create
                              </button>
                            ) : column.key === 'requestNo' ? (
                              <span className="request-no">{row.requestNo || ''}</span>
                            ) : column.key === 'companyCode' ? (
                              <input
                                className="request-input"
                                data-row-id={row.id}
                                data-request-field="companyCode"
                                type="text"
                                value={row.companyCode || ''}
                                placeholder="Co.Code"
                                disabled={disabled}
                                onChange={(event) =>
                                  onFieldChange(row.id, 'companyCode', event.target.value)
                                }
                              />
                            ) : (
                              row[column.key as 'beneficiary' | 'beneficiaryName']
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button id="requestDone" className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type DateCellProps = {
  row: RequestDraft
  field: DateField
  disabled: boolean
  anchorRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>
  calendar: CalendarState | null
  openAnchor: HTMLButtonElement | null
  onOpenCalendar: (rowId: string, field: DateField) => void
  onFieldChange: (rowId: string, field: DraftTextField, value: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToggleMode: () => void
  onPickYear: (year: number) => void
  onPickMonth: (month: number) => void
  onPickDay: (dateText: string) => void
  onClearDate: () => void
  onToday: () => void
}

function DateCell({
  row,
  field,
  disabled,
  anchorRefs,
  calendar,
  openAnchor,
  onOpenCalendar,
  onFieldChange,
  onPrevMonth,
  onNextMonth,
  onToggleMode,
  onPickYear,
  onPickMonth,
  onPickDay,
  onClearDate,
  onToday,
}: DateCellProps) {
  const isOpen = calendar?.rowId === row.id && calendar?.field === field

  return (
    <div className="request-date-shell">
      <input
        className="request-input request-date-input"
        data-row-id={row.id}
        data-request-field={field}
        type="text"
        value={row[field]}
        placeholder="DD-MM-YYYY"
        disabled={disabled}
        onChange={(event) => onFieldChange(row.id, field, event.target.value)}
      />
      <button
        ref={(el) => {
          if (el) anchorRefs.current.set(`${row.id}:${field}`, el)
          else anchorRefs.current.delete(`${row.id}:${field}`)
        }}
        className="request-calendar-btn"
        data-row-id={row.id}
        data-calendar-field={field}
        type="button"
        disabled={disabled}
        onClick={() => onOpenCalendar(row.id, field)}
      />
      {isOpen && calendar ? (
        <RequestCalendar
          rowId={row.id}
          field={field}
          anchorEl={openAnchor}
          viewDate={calendar.viewDate}
          viewYear={calendar.viewYear}
          mode={calendar.mode}
          selectedText={row[field]}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          onToggleMode={onToggleMode}
          onPickYear={onPickYear}
          onPickMonth={onPickMonth}
          onPickDay={onPickDay}
          onClear={onClearDate}
          onToday={onToday}
        />
      ) : null}
    </div>
  )
}
