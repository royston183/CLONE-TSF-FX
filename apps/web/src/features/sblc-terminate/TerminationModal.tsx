import { CalendarPopup } from './CalendarPopup.tsx'

export type TerminationModalProps = {
  open: boolean
  date: string
  onDateChange: (value: string) => void
  calendarOpen: boolean
  onToggleCalendar: () => void
  onCloseCalendar: () => void
  onClose: () => void
  onUpdate: () => void
}

export function TerminationModal({
  open,
  date,
  onDateChange,
  calendarOpen,
  onToggleCalendar,
  onCloseCalendar,
  onClose,
  onUpdate,
}: TerminationModalProps) {
  return (
    <div id="terminationModal" className={'modal-bg' + (open ? ' open' : '')}>
      <div className="modal small">
        <div className="modal-head">
          <div className="modal-title">SBLC: Initiate Termination</div>
          <button id="terminationClose" className="modal-close" type="button" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-label">Enter Date<span className="req">*</span></div>
            <div className="form-date-shell">
              <input
                id="terminationDate"
                className="form-date-input"
                type="text"
                placeholder="DD-MM-YYYY"
                autoComplete="off"
                value={date}
                onChange={(e) => onDateChange(e.target.value)}
              />
              <button
                id="terminationCalendarBtn"
                className="calendar-btn"
                type="button"
                aria-label="Open termination date calendar"
                onClick={onToggleCalendar}
              />
              {calendarOpen ? (
                <CalendarPopup id="terminationCalendar" value={date} onSelect={onDateChange} onClose={onCloseCalendar} />
              ) : (
                <div id="terminationCalendar" className="calendar-popup" />
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button id="terminationCancel" className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button id="terminationUpdate" className="btn btn-primary" type="button" onClick={onUpdate}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
