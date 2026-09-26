import { useEffect, useRef, useState } from 'react'
import { MONTH_NAMES, fmtDate, parseDDMMYYYY } from './format.ts'
import { calendarCells, shiftMonth } from './logic.ts'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * Upto Blotter Date: a free-text DD-MM-YYYY input with the page's own popup calendar. The
 * calendar opens from the icon (which toggles it) or when the input takes focus, starts on
 * the typed date's month when it can read one — otherwise on the month it was last left at —
 * and closes on a day click or any click outside the field.
 *
 * `invalid` puts has-error on the .date-field wrapper, where the page put it. The page's
 * error styles are all keyed on `.field.has-error`, so — as there — that shows nothing; the
 * visible effect of a missing date is that View Deals does not run.
 */
export function BlotterDateField({
  value,
  invalid,
  onChange,
}: {
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target || !target.isConnected) return
      if (!fieldRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const toggle = () => {
    if (!open) {
      const existing = parseDDMMYYYY(value)
      if (existing) setView({ year: existing.getFullYear(), month: existing.getMonth() })
    }
    setOpen(!open)
  }

  const cells = open ? calendarCells(view.year, view.month, parseDDMMYYYY(value), new Date()) : []

  return (
    <div className={`date-field${invalid ? ' has-error' : ''}`} id="blotterDateField" ref={fieldRef}>
      <input
        className="input"
        id="blotterDateInput"
        placeholder="dd-mm-yyyy"
        autoComplete="off"
        value={value}
        onFocus={() => {
          if (!open) toggle()
        }}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="date-icon-btn"
        id="blotterDateIcon"
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
      >
        &#128197;
      </button>
      <div className={`calendar-pop${open ? ' open' : ''}`} id="blotterCalendar">
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" id="calPrev" onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}>
                &#8249;
              </button>
              <div className="cal-title">
                {MONTH_NAMES[view.month]} {view.year}
              </div>
              <button type="button" id="calNext" onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}>
                &#8250;
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {cells.map((c, i) =>
                c.muted ? (
                  <div key={i} className="cal-day muted">
                    {c.day}
                  </div>
                ) : (
                  <div
                    key={i}
                    className={`cal-day${c.today ? ' today' : ''}${c.selected ? ' selected' : ''}`}
                    onClick={() => {
                      onChange(fmtDate(new Date(view.year, view.month, c.day)))
                      setOpen(false)
                    }}
                  >
                    {c.day}
                  </div>
                ),
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
