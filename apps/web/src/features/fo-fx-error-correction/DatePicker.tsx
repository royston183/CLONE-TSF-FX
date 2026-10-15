import { useState, type CSSProperties, type ReactNode } from 'react'
import { MONTH_ABBR, fmtDate, safeParseDate } from './format.ts'

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The filter bar's calendar glyph; the correction popup's pickers use the 📅 emoji instead. */
export const CALENDAR_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/**
 * The page's custom DD-MM-YYYY date picker (.dp), shared by the filter bar and the Value /
 * Trade / Blotter Date fields of the FX Error Correction popup. Which picker is open is owned by
 * the parent, because opening one closes the others and an outside click closes them all.
 */
export function DatePicker({
  id,
  value,
  open,
  onOpenChange,
  onPick,
  icon = CALENDAR_ICON,
  inputStyle,
  disabled = false,
}: {
  id: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
  icon?: ReactNode
  inputStyle?: CSSProperties
  /** A read-only transaction: the input is disabled and the calendar will not open. */
  disabled?: boolean
}) {
  const [view, setView] = useState(() => new Date())

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const current = safeParseDate(value) ?? new Date()
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
  const selected = safeParseDate(value)
  const today = new Date()
  const sameDay = (d: Date | null, day: number) => !!d && d.getFullYear() === y && d.getMonth() === m && d.getDate() === day

  return (
    <div className="dp">
      <input id={id} type="text" value={value} disabled={disabled} placeholder="DD-MM-YYYY" aria-label={id === 'new-blotterdate' ? 'Blotter Date' : id === 'new-tradedate' ? 'Trade Date' : id === 'new-valuedate' ? 'Value Date' : undefined} aria-invalid={!!value && !safeParseDate(value)} onChange={e => onPick(e.target.value)} style={inputStyle} />
      <button type="button" className="dp-btn" disabled={disabled} onClick={toggle} aria-label="Open calendar">
        {icon}
      </button>
      <div className={`dp-popup${open ? ' open' : ''}`} id={`${id}-cal`}>
        {open ? (
          <>
            <div className="dp-head">
              <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}>
                ‹
              </button>
              <select aria-label="Calendar month" data-no-search value={m} onChange={e => setView(new Date(y, Number(e.target.value), 1))}>
                {MONTH_ABBR.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <select aria-label="Calendar year" data-no-search value={y} onChange={e => setView(new Date(Number(e.target.value), m, 1))}>
                {Array.from({ length: Math.max(new Date().getFullYear() + 100, y) - Math.min(1900, y) + 1 }, (_, index) => Math.min(1900, y) + index).map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}>
                ›
              </button>
            </div>
            <div className="dp-grid">
              {DOW_LABELS.map((dw) => (
                <div key={dw} className="dp-dow">
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
                  <button type="button"
                    key={d}
                    className={cls}
                    aria-label={fmtDate(new Date(y, m, d))}
                    onClick={() => {
                      onPick(fmtDate(new Date(y, m, d)))
                      onOpenChange(false)
                    }}
                  >
                    {d}
                  </button>
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
