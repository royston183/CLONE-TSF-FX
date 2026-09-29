import { useCallback, useRef, useState } from 'react'
import { formatDate, parseDMY } from './format.ts'
import { useFloatingPanel } from './floating.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The Fixing Date filter: a DD-MM-YYYY text box with the original's table-grid calendar pop-up. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseDMY(value) ?? new Date(2026, 8, 28))
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({ open, wrapRef, panelRef, onOutside: close, contentKey: `${view.getFullYear()}-${view.getMonth()}` })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const base = parseDMY(value) ?? new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const pick = (d: Date) => {
    onChange(formatDate(d))
    setOpen(false)
  }

  const selected = parseDMY(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const today = new Date(2026, 8, 28)
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDay = first.getDay()

  const weeks: Array<Array<number | null>> = []
  let day = 1
  let cell = 0
  while (day <= last.getDate()) {
    const week: Array<number | null> = []
    for (let i = 0; i < 7; i++) {
      if (cell < startDay || day > last.getDate()) week.push(null)
      else {
        week.push(day)
        day++
      }
      cell++
    }
    weeks.push(week)
  }

  return (
    <div ref={wrapRef} className="date-wrap" id="dateWrap">
      <input className="control date-input" id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} placeholder="Fixing Date" />
      <button className="date-btn" type="button" title="Choose fixing date" onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" d="M4 6h16v14H4zM8 3v6m8-6v6M4 10h16" />
        </svg>
      </button>
      {open ? (
        <div ref={panelRef} className="calendar-pop open" onClick={(e) => e.stopPropagation()}>
          <div className="cal-head">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
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
              {Array.from({ length: 11 }, (_, i) => year - 5 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
              &rsaquo;
            </button>
          </div>
          <div className="cal-grid">
            <div className="cal-row">
              {DOW.map((d) => (
                <div className="cal-cell cal-day-name" key={d}>
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div className="cal-row" key={wi}>
                {week.map((d, di) => {
                  if (d === null) return <div className="cal-cell cal-date blank" key={di} />
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d
                  const isSelected = !!selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === d
                  return (
                    <div key={di} className={`cal-cell cal-date${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => pick(new Date(year, month, d))}>
                      {d}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
