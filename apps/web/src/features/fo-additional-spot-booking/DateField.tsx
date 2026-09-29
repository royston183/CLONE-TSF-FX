import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { formatDate, parseDate } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const YEARS = Array.from({ length: 13 }, (_, i) => 2022 + i)

/** A DD-MM-YYYY text box with the original's pop-up calendar (month/year selects, 6-week grid). */
export function DateField({
  id,
  value,
  onChange,
  placeholder,
  onPicked,
  className = 'control filter-input date-field',
}: {
  id?: string | undefined
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  /** A date was chosen from the calendar (the caller can clear its own field error here). */
  onPicked?: (() => void) | undefined
  className?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { gap: 5 },
    onOutside: close,
    onScrollAway: close,
    contentKey: `${view.getFullYear()}-${view.getMonth()}`,
  })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const selected = parseDate(value)
    const base = selected ?? new Date(2026, 8, 28)
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const pick = (day: Date) => {
    onChange(formatDate(day))
    setOpen(false)
    onPicked?.()
  }

  const selected = parseDate(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const today = new Date(2026, 8, 28)
  const sameDay = (a: Date, b: Date | null) => !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  return (
    <div ref={wrapRef} className="date-shell">
      <input id={id} className={className} type="text" placeholder={placeholder} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="cal-icon" type="button" title="Choose date" onClick={toggle}>
        ▣
      </button>
      {open ? (
        <div ref={panelRef} className="calendar" style={{ display: 'block' }}>
          <div className="cal-top">
            <button className="cal-nav" type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
              ‹
            </button>
            <select className="cal-select cal-month" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select className="cal-select cal-year" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="cal-nav" type="button" style={{ marginLeft: 'auto' }} onClick={() => setView(new Date(year, month + 1, 1))}>
              ›
            </button>
          </div>
          <table className="cal-grid">
            <thead>
              <tr>
                {DOW.map((d) => (
                  <th key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, w) => (
                <tr key={w}>
                  {Array.from({ length: 7 }, (_, d) => {
                    const day = new Date(start)
                    day.setDate(start.getDate() + w * 7 + d)
                    let cls = 'cal-day'
                    if (day.getMonth() !== month) cls += ' other'
                    if (sameDay(day, today)) cls += ' today'
                    if (sameDay(day, selected)) cls += ' selected'
                    return (
                      <td key={d}>
                        <button type="button" className={cls} onClick={() => pick(day)}>
                          {day.getDate()}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
