import { useEffect, useRef, useState } from 'react'
import { MONTH_NAMES, formatDMY, parseDMY } from './format.ts'
import { CalendarSelects } from '../../shared/fx/CalendarSelects.tsx'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The month the calendar first shows: the demo data's fixing dates start in September 2027. */
const INITIAL_VIEW = new Date(2027, 8, 1)

/**
 * The Fixing Date box with the original's pop-up calendar. It opens on focus (on the typed
 * date's month when there is one), keeps the month it was last left on, and closes when a day
 * is picked or on a click outside the box and calendar. Typing is free-form; View Deals
 * validates it.
 */
export function FixingDateField({
  value,
  invalid,
  onType,
  onPick,
}: {
  value: string
  invalid: boolean
  onType: (raw: string) => void
  /** A day was chosen from the calendar; the text is DD-MM-YYYY. */
  onPick: (dmy: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(INITIAL_VIEW)
  const inputRef = useRef<HTMLInputElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!calRef.current?.contains(t) && t !== inputRef.current) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const onFocus = () => {
    if (value) {
      const d = parseDMY(value)
      // The original navigated to whatever the text parsed to; a half-typed date gave an
      // Invalid Date and a blank calendar, so that case keeps the current month instead.
      if (!Number.isNaN(d.getTime())) setView(d)
    }
    setOpen(true)
  }

  const y = view.getFullYear()
  const m = view.getMonth()
  const startDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrevMonth = new Date(y, m, 0).getDate()
  const remaining = (7 - ((startDow + daysInMonth) % 7)) % 7
  const today = new Date().toDateString()
  const selected = value ? parseDMY(value).toDateString() : null

  return (
    <div className="dropdown-wrap">
      <input
        ref={inputRef}
        type="text"
        id="fixingDateInput"
        className={`input${invalid ? ' error' : ''}`}
        placeholder="dd-mm-yyyy"
        autoComplete="off"
        value={value}
        onFocus={onFocus}
        onChange={(e) => onType(e.target.value)}
      />
      <div id="fixingCalendar" ref={calRef} className={`calendar-popup${open ? '' : ' hidden'}`}>
        <div className="cal-header">
          <button type="button" className="cal-nav-btn" id="calPrev" onClick={() => setView(new Date(y, m - 1, 1))}>
            &#8249;
          </button>
          <CalendarSelects year={y} month={m} onChange={(year, month) => setView(new Date(year, month, 1))} />
          <button type="button" className="cal-nav-btn" id="calNext" onClick={() => setView(new Date(y, m + 1, 1))}>
            &#8250;
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {Array.from({ length: startDow }, (_, i) => (
            <div key={`p${i}`} className="cal-day muted">
              {daysInPrevMonth - startDow + i + 1}
            </div>
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const ds = new Date(y, m, day).toDateString()
            let cls = 'cal-day'
            if (ds === today) cls += ' today'
            if (ds === selected) cls += ' selected'
            return (
              <div
                key={day}
                className={cls}
                onClick={() => {
                  onPick(formatDMY(new Date(y, m, day)))
                  setOpen(false)
                }}
              >
                {day}
              </div>
            )
          })}
          {Array.from({ length: remaining }, (_, i) => (
            <div key={`n${i}`} className="cal-day muted">
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
