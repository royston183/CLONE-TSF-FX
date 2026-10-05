import { useState } from 'react'
import { AS_OF_ISO, CALENDAR_YEARS } from './data.ts'
import { MONTH_SHORT, dmyToISO, isoToDMY } from './format.ts'
import { calendarCells, shiftMonth } from './logic.ts'
import type { CalendarView } from './types.ts'

/**
 * The Key Date box with its calendar. Month ends are marked on the calendar, today is the fixed demo
 * date, and the page owns whether the popup is open so that other panels close when it opens.
 */
export function KeyDateField({
  text,
  error,
  open,
  onOpenChange,
  onType,
  onBlur,
  onEnter,
  onPick,
}: {
  text: string
  error: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onType: (text: string) => void
  onBlur: () => void
  onEnter: () => void
  /** A day was chosen; the argument is its DD-MM-YYYY text. */
  onPick: (text: string) => void
}) {
  const [cal, setCal] = useState<CalendarView>({ y: 2026, m: 8 })

  const openCalendar = () => {
    // The view is initialised only when opening, from the typed date or the demo "today".
    const d = dmyToISO(text) || AS_OF_ISO
    setCal({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 })
    onOpenChange(true)
  }
  const sel = dmyToISO(text)

  return (
    <div className={`tb-field f-date${error ? ' has-error' : ''}`} id="field-keyDate">
      <label htmlFor="input-keyDate">
        Key Date<span className="req">*</span>
      </label>
      <div className="date-field">
        <input
          className="control"
          id="input-keyDate"
          placeholder="DD-MM-YYYY"
          autoComplete="off"
          maxLength={10}
          title="Key Date must be the month end date"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onBlur={onBlur}
          onClick={() => {
            if (!open) openCalendar()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
        />
        <button
          type="button"
          className="date-icon"
          id="btnKeyDateIcon"
          aria-label="Open calendar"
          onClick={() => (open ? onOpenChange(false) : openCalendar())}
        >
          &#128197;
        </button>
        <div className={`date-popup${open ? ' open' : ''}`} id="popup-keyDate">
          {open ? (
            <>
              <div className="cal-head">
                <button type="button" aria-label="Previous month" onClick={() => setCal(shiftMonth(cal, -1))}>
                  &lsaquo;
                </button>
                <span className="cal-selects">
                  <select
                    aria-label="Month"
                    value={cal.m}
                    onChange={(e) => setCal({ ...cal, m: parseInt(e.target.value, 10) })}
                  >
                    {MONTH_SHORT.map((name, i) => (
                      <option key={name} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Year"
                    value={cal.y}
                    onChange={(e) => setCal({ ...cal, y: parseInt(e.target.value, 10) })}
                  >
                    {CALENDAR_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </span>
                <button type="button" aria-label="Next month" onClick={() => setCal(shiftMonth(cal, 1))}>
                  &rsaquo;
                </button>
              </div>
              <div className="cal-grid">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <div key={d} className="dow">
                    {d}
                  </div>
                ))}
                {calendarCells(cal).map((c, i) =>
                  c.kind === 'muted' ? (
                    <div key={`m${i}`} className="day muted">
                      {c.day}
                    </div>
                  ) : (
                    <div
                      key={c.iso}
                      className={`day${c.eom ? ' eom' : ''}${c.iso === sel ? ' selected' : ''}${c.iso === AS_OF_ISO ? ' today' : ''}`}
                      onClick={() => onPick(isoToDMY(c.iso))}
                    >
                      {c.day}
                    </div>
                  ),
                )}
              </div>
              <div className="cal-legend">
                <i></i>Month end dates
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="tb-error" id="err-keyDate">
        {error}
      </div>
    </div>
  )
}
