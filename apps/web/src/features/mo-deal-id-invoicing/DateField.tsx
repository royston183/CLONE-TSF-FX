import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { formatDate, parseDMY } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** A DD-MM-YYYY text box with the original's pop-up calendar (month/year selects, 6-week grid). */
export function DateField({ id, value, onChange, ariaLabel }: { id: string; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseDMY(value) ?? new Date(2026, 8, 28))
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({ open, wrapRef, panelRef, options: { gap: 5 }, onOutside: close, contentKey: `${view.getFullYear()}-${view.getMonth()}` })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const selected = parseDMY(value)
    const base = selected ?? new Date(2026, 8, 28)
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const pick = (day: Date) => {
    onChange(formatDate(day))
    setOpen(false)
  }

  const selected = parseDMY(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date(2026, 8, 28)
  const sameDay = (a: Date, b: Date | null) => !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const years = Array.from({ length: 13 }, (_, i) => year - 6 + i)

  return (
    <div ref={wrapRef} className="date-picker">
      <input id={id} type="text" value={value} maxLength={10} inputMode="numeric" aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="calendar-btn" type="button" title="Choose date" aria-label={ariaLabel} onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 3v4M16 3v4M4 9h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div ref={panelRef} className="calendar-popup open" onClick={(e) => e.stopPropagation()}>
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))}>
              &#8249;
            </button>
            <select className="cal-month" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select className="cal-year" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))}>
              &#8250;
            </button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => (
              <div className="cal-weekday" key={w}>
                {w}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <button type="button" className="cal-day empty" tabIndex={-1} key={`e${i}`}>
                0
              </button>
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const date = new Date(year, month, day)
              let cls = 'cal-day'
              if (sameDay(date, today)) cls += ' today'
              if (sameDay(date, selected)) cls += ' selected'
              return (
                <button type="button" className={cls} key={day} onClick={() => pick(date)}>
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
