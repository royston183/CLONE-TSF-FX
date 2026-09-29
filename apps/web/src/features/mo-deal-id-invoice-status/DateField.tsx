import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { dateToIso, parseDisplayDate, toDisplayDate } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The Key Date field: a DD-MM-YYYY text box with the original's pop-up calendar. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseDisplayDate(value) ?? new Date(2026, 8, 28))
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({ open, wrapRef, panelRef, onOutside: close, contentKey: `${view.getFullYear()}-${view.getMonth()}` })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const base = parseDisplayDate(value) ?? new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const pick = (day: Date) => {
    onChange(toDisplayDate(dateToIso(day)))
    setOpen(false)
  }

  const selected = parseDisplayDate(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1).getDay()
  const start = new Date(year, month, 1 - first)
  const today = new Date()
  const sameDay = (a: Date, b: Date | null) => !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  return (
    <div ref={wrapRef} className="date-wrap" id="dateWrap">
      <input className="control date-input" id={id} type="text" placeholder="Key Date" maxLength={10} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="calendar-trigger" type="button" title="Choose key date" onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>
      {open ? (
        <div ref={panelRef} className="calendar-pop open" onClick={(e) => e.stopPropagation()}>
          <div className="cal-head">
            <button className="cal-nav" type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
              &lsaquo;
            </button>
            <select className="cal-select cal-month" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select className="cal-select cal-year" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
              {Array.from({ length: 15 }, (_, i) => year - 7 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="cal-nav" type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
              &rsaquo;
            </button>
          </div>
          <div className="cal-grid">
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
              let cls = 'cal-day'
              if (d.getMonth() !== month) cls += ' other'
              if (sameDay(d, today)) cls += ' today'
              if (selected && sameDay(d, selected)) cls += ' selected'
              return (
                <button type="button" className={cls} key={i} onClick={() => pick(d)}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
