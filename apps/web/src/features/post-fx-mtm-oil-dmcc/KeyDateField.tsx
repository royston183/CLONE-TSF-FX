import { useEffect, useRef, useState } from 'react'
import { DAY_NAMES, MONTH_LONG } from './data.ts'
import { useFloatingPanel } from './floating.ts'
import { formatDMY, parseDMY } from './format.ts'
import { ERR_KEY_REQUIRED, calendarDays, calendarYears, shiftMonth } from './logic.ts'
import type { CalendarView } from './types.ts'

type Props = {
  text: string
  /** The inline error text, or null; any text turns the field red. */
  error: string | null
  onTyping: (text: string) => void
  /** Validate the text: on leaving the box with something in it, and after a calendar pick. */
  onCommit: (text: string) => void
  onEnter: () => void
}

/**
 * Key Date field: a dd-mm-yyyy box with a calendar popup (month and year selectors). The shown month
 * is initialised only when the popup opens. The popup floats right-aligned under the field and
 * closes on an outside click or scroll, repositions on resize.
 */
export function KeyDateField({ text, error, onTyping, onCommit, onEnter }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<CalendarView>({ year: 0, month: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { style, reposition } = useFloatingPanel(open, wrapRef, popupRef, { alignRight: true, gap: 6 }, [view])

  const openCalendar = () => {
    const sel = parseDMY(text) ?? new Date()
    setView({ year: sel.getFullYear(), month: sel.getMonth() })
    setOpen(true)
  }
  const toggle = () => (open ? setOpen(false) : openCalendar())

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!popupRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  const today = new Date()
  const selected = parseDMY(text)
  const years = calendarYears(view.year, today.getFullYear())

  return (
    <div className={`field f-date${error ? ' has-error' : ''}`} id="field-keyDate">
      <label htmlFor="input-keyDate">
        Key Date<span className="req">*</span>
      </label>
      <div className="date-field" ref={wrapRef}>
        <input
          className="control"
          id="input-keyDate"
          placeholder="DD-MM-YYYY"
          autoComplete="off"
          value={text}
          onChange={(e) => onTyping(e.target.value)}
          onClick={() => {
            if (!open) openCalendar()
          }}
          onBlur={() => {
            if (text.trim()) onCommit(text)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') onEnter()
          }}
        />
        <button type="button" className="date-icon" aria-label="Open calendar" onClick={toggle}>
          📅
        </button>
        {open && (
          <div className="date-popup open" id="popup-keyDate" ref={popupRef} style={style}>
            <div className="cal-head">
              <button type="button" aria-label="Previous month" onClick={() => setView(shiftMonth(view, -1))}>
                ‹
              </button>
              <span className="cal-selects">
                <select
                  className="cal-sel"
                  aria-label="Month"
                  value={view.month}
                  onChange={(e) => setView({ ...view, month: parseInt(e.target.value, 10) })}
                >
                  {MONTH_LONG.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="cal-sel"
                  aria-label="Year"
                  value={view.year}
                  onChange={(e) => setView({ ...view, year: parseInt(e.target.value, 10) })}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
              <button type="button" aria-label="Next month" onClick={() => setView(shiftMonth(view, 1))}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DAY_NAMES.map((d) => (
                <div key={d} className="dow">
                  {d}
                </div>
              ))}
              {calendarDays(view, selected, today).map((c, i) =>
                c.muted ? (
                  <div key={`m${i}`} className="day muted">
                    {c.day}
                  </div>
                ) : (
                  <div
                    key={c.day}
                    className={`day${c.selected ? ' selected' : ''}${c.today ? ' today' : ''}`}
                    onClick={() => {
                      const picked = formatDMY(new Date(view.year, view.month, c.day))
                      setOpen(false)
                      onTyping(picked)
                      onCommit(picked)
                    }}
                  >
                    {c.day}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>
      <div className="hint" id="hint-keyDate">
        Key Date is the Month End Date
      </div>
      <div className="error-msg" id="err-keyDate">
        {error ?? ERR_KEY_REQUIRED}
      </div>
    </div>
  )
}
