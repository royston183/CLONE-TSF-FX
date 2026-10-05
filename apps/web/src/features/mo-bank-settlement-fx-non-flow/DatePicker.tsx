import { useState } from 'react'
import { MONTH_ABBR, fmtDate, parseDMY } from './format.ts'

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * The page's custom DD-MM-YYYY date picker (.dp) used on the Value Date range. Which picker is
 * open is owned by the parent, because opening one closes the other and an outside click or
 * Escape closes both.
 */
export function DatePicker({
  id,
  value,
  open,
  onOpenChange,
  onPick,
}: {
  id: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
}) {
  const [view, setView] = useState(() => new Date())

  const toggle = () => {
    if (!open) {
      const current = parseDMY(value) ?? new Date()
      setView(new Date(current.getFullYear(), current.getMonth(), 1))
    }
    onOpenChange(!open)
  }

  const y = view.getFullYear()
  const m = view.getMonth()
  const firstDow = new Date(y, m, 1).getDay()
  const totalDays = new Date(y, m + 1, 0).getDate()
  const prevMonthDays = new Date(y, m, 0).getDate()
  const trailing = (7 - ((firstDow + totalDays) % 7)) % 7
  const selected = parseDMY(value)
  const today = new Date()
  const sameDay = (d: Date | null, day: number) =>
    !!d && d.getFullYear() === y && d.getMonth() === m && d.getDate() === day

  return (
    <div className="dp">
      <input id={id} type="text" value={value} readOnly onClick={toggle} />
      <button type="button" className="dp-btn" onClick={toggle} aria-label="Open calendar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <div className={`dp-popup${open ? ' open' : ''}`} id={`dp-popup-${id}`}>
        {open ? (
          <>
            <div className="dp-head">
              <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}>
                ‹
              </button>
              <span className="dp-month-label">
                {MONTH_ABBR[m]} {y}
              </span>
              <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}>
                ›
              </button>
            </div>
            <div className="dp-grid">
              {DOW_LABELS.map((dw, i) => (
                <div key={i} className="dp-dow">
                  {dw}
                </div>
              ))}
              {Array.from({ length: firstDow }, (_, i) => (
                <div key={`p${i}`} className="dp-day muted">
                  {prevMonthDays - firstDow + 1 + i}
                </div>
              ))}
              {Array.from({ length: totalDays }, (_, i) => {
                const d = i + 1
                const cls = sameDay(selected, d) ? 'dp-day selected' : sameDay(today, d) ? 'dp-day today' : 'dp-day'
                return (
                  <div
                    key={d}
                    className={cls}
                    onClick={() => {
                      onPick(fmtDate(new Date(y, m, d)))
                      onOpenChange(false)
                    }}
                  >
                    {d}
                  </div>
                )
              })}
              {Array.from({ length: trailing }, (_, i) => (
                <div key={`n${i}`} className="dp-day muted">
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
