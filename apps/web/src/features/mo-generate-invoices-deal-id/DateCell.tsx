import { useCallback, useRef, useState } from 'react'
import { formatDMY, parseDMY } from './format.ts'
import { useFloatingPanel } from './floating.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const TODAY = new Date()

/** The Invoice Date cell: a dd-mm-yyyy text box plus the legacy's fixed-position calendar trigger. */
export function DateCell({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseDMY(value) ?? TODAY)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({ open, wrapRef, panelRef, onOutside: close, contentKey: `${view.getFullYear()}-${view.getMonth()}` })

  const toggle = () => {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    setView(parseDMY(value) ?? TODAY)
    setOpen(true)
  }

  const pick = (d: Date) => {
    onChange(formatDMY(d))
    setOpen(false)
  }

  const selected = parseDMY(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const cells: Array<{ day: number; mm: number; yy: number; muted: boolean }> = []
  for (let i = 0; i < 42; i++) {
    let day: number
    let mm = month
    let yy = year
    let muted = false
    if (i < startDay) {
      day = prevDays - startDay + i + 1
      mm = month - 1
      muted = true
      if (mm < 0) {
        mm = 11
        yy--
      }
    } else if (i >= startDay + days) {
      day = i - startDay - days + 1
      mm = month + 1
      muted = true
      if (mm > 11) {
        mm = 0
        yy++
      }
    } else {
      day = i - startDay + 1
    }
    cells.push({ day, mm, yy, muted })
  }

  return (
    <span ref={wrapRef} className="date-cell">
      <input className="cell-input date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <button className="date-trigger" type="button" disabled={disabled} title="Choose date" onClick={toggle}>
        ▦
      </button>
      {open ? (
        <div ref={panelRef} className="calendar open" onClick={(e) => e.stopPropagation()}>
          <div className="cal-head">
            <button className="cal-nav" type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
              ‹
            </button>
            <select className="cal-select" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select className="cal-select" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
              {Array.from({ length: 9 }, (_, i) => 2024 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="cal-nav" type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
              ›
            </button>
          </div>
          <div className="cal-week">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-days">
            {cells.map((c, i) => {
              const val = formatDMY(new Date(c.yy, c.mm, c.day))
              const isToday = c.day === TODAY.getDate() && c.mm === TODAY.getMonth() && c.yy === TODAY.getFullYear()
              const isSelected = !!selected && val === value
              return (
                <button
                  key={i}
                  type="button"
                  className={`cal-day${c.muted ? ' muted' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => pick(new Date(c.yy, c.mm, c.day))}
                >
                  {c.day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </span>
  )
}
