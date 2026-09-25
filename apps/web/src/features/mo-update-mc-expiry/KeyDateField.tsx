import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { formatDMY, parseDMY } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * The Key Date box with the original's pop-up month calendar. It opens on focus or from the
 * calendar button and closes on an outside click; the parent owns `open` so Escape can close it.
 */
export function KeyDateField({
  value,
  invalid,
  error,
  open,
  onOpenChange,
  onType,
  onBlur,
  onEnter,
  onPick,
}: {
  value: string
  invalid: boolean
  error: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onType: (raw: string) => void
  onBlur: () => void
  onEnter: () => void
  /** A day was chosen from the calendar; the text is DD-MM-YYYY. */
  onPick: (dmy: string) => void
}) {
  const [view, setView] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: globalThis.MouseEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && t !== inputRef.current && t !== iconRef.current) onOpenChange(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open, onOpenChange])

  const openPicker = () => {
    const cur = parseDMY(value)
    if (cur) {
      setView(new Date(cur.getFullYear(), cur.getMonth(), 1))
      setSelected(cur)
    }
    onOpenChange(true)
  }

  const nav = (e: MouseEvent, delta: number) => {
    e.stopPropagation()
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1))
  }

  const year = view.getFullYear()
  const month = view.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7
  const todayStr = formatDMY(new Date())
  const selectedStr = selected ? formatDMY(selected) : null

  return (
    <div className="field date-field">
      <label htmlFor="keyDateInput">
        Key Date<span className="req">*</span>
      </label>
      <input
        ref={inputRef}
        className={`control${invalid ? ' invalid' : ''}`}
        id="keyDateInput"
        type="text"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        autoComplete="off"
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={openPicker}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
      <button
        ref={iconRef}
        className="date-icon-btn"
        type="button"
        aria-label="Open calendar"
        onClick={(e) => {
          e.stopPropagation()
          if (open) onOpenChange(false)
          else openPicker()
        }}
      >
        📅
      </button>
      <div ref={popRef} className={`calendar-pop${open ? ' open' : ''}`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" className="cal-nav" onClick={(e) => nav(e, -1)}>
                ‹
              </button>
              <span className="cal-title">
                {MONTHS[month]} {year}
              </span>
              <button type="button" className="cal-nav" onClick={(e) => nav(e, 1)}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: startOffset }, (_, i) => (
                <div key={`p${i}`} className="cal-day muted">
                  {daysInPrevMonth - startOffset + 1 + i}
                </div>
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dmy = formatDMY(new Date(year, month, day))
                let cls = 'cal-day'
                if (dmy === todayStr) cls += ' today'
                if (dmy === selectedStr) cls += ' selected'
                return (
                  <div
                    key={day}
                    className={cls}
                    data-date={dmy}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(parseDMY(dmy))
                      onOpenChange(false)
                      onPick(dmy)
                    }}
                  >
                    {day}
                  </div>
                )
              })}
              {Array.from({ length: trailing }, (_, i) => (
                <div key={`n${i}`} className="cal-day muted">
                  {i + 1}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <span className={`field-error${invalid ? ' show' : ''}`} id="keyDateError">
        {error}
      </span>
    </div>
  )
}
