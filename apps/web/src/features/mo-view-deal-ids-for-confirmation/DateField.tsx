import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { fmtDate, parseDMY } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * The Key Date box: DD-MM-YYYY text with the pop-up month calendar the original ported from
 * Create Master Contract. The typed value is committed on blur, a picked day at once.
 */
export function DateField({
  value,
  onChange,
  onCommit,
}: {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
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
    options: { alignRight: false, gap: 6 },
    onOutside: close,
    onScrollAway: close,
    contentKey: `${view.getFullYear()}-${view.getMonth()}`,
  })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const selected = parseDMY(value)
    if (selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1))
    setOpen(true)
  }

  const selected = parseDMY(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7
  const today = new Date().toDateString()

  return (
    <div ref={wrapRef} className="date-field">
      <input
        className="control"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onClick={toggle}
      />
      <button type="button" className="date-icon" aria-label="Open calendar" onClick={toggle}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div ref={panelRef} className={`date-popup${open ? ' open' : ''}`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
                ‹
              </button>
              <span className="cal-title">
                {MONTHS[month]} {year}
              </span>
              <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: startOffset }, (_, i) => (
                <div key={`p${i}`} className="day muted">
                  {daysInPrevMonth - startOffset + 1 + i}
                </div>
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const date = new Date(year, month, day)
                let cls = 'day'
                if (
                  selected &&
                  date.getTime() === new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime()
                )
                  cls += ' selected'
                if (date.toDateString() === today) cls += ' today'
                return (
                  <div
                    key={day}
                    className={cls}
                    onClick={() => {
                      const picked = fmtDate(date)
                      onChange(picked)
                      setOpen(false)
                      onCommit(picked)
                    }}
                  >
                    {day}
                  </div>
                )
              })}
              {Array.from({ length: trailing }, (_, i) => (
                <div key={`n${i}`} className="day muted">
                  {i + 1}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
