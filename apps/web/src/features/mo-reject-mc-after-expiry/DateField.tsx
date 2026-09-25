import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatDMY, parseDMY } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const POP_WIDTH = 248

/**
 * A mandatory DD-MM-YYYY box with the original's pop-up month calendar (buildDatePicker).
 * It opens on focus and on the (CSS-hidden) calendar icon. The original moved the popup to
 * <body> so no ancestor's overflow could clip it; here it stays inside .mormc — the scoped
 * stylesheet only reaches it there — and is placed against the viewport with position:fixed,
 * which escapes the same clipping.
 */
export function DateField({
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  id: string
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const positionPop = useCallback(() => {
    const input = inputRef.current
    const pop = popRef.current
    if (!input || !pop) return
    const rect = input.getBoundingClientRect()
    let left = rect.left
    const maxLeft = window.innerWidth - POP_WIDTH - 8
    if (left > maxLeft) left = Math.max(8, maxLeft)
    pop.style.top = `${rect.bottom + 6}px`
    pop.style.left = `${left}px`
  }, [])

  useLayoutEffect(() => {
    if (open) positionPop()
  }, [open, positionPop])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      // A calendar re-render can detach the clicked cell before the click reaches here.
      if (!target || !target.isConnected) return
      if (popRef.current?.contains(target) || target === inputRef.current || target === iconRef.current) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', positionPop, true)
    window.addEventListener('resize', positionPop)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', positionPop, true)
      window.removeEventListener('resize', positionPop)
    }
  }, [open, positionPop])

  const openPop = () => {
    const cur = parseDMY(value)
    if (cur) {
      setView(new Date(cur.getFullYear(), cur.getMonth(), 1))
      setSelected(cur)
    }
    setOpen(true)
  }

  const year = view.getFullYear()
  const month = view.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7
  const todayStr = formatDMY(new Date())
  const selectedStr = formatDMY(selected)

  return (
    <div className="field date-field">
      <label htmlFor={id}>
        {label}
        <span className="req">*</span>
      </label>
      <input
        ref={inputRef}
        className={`control${invalid ? ' invalid' : ''}`}
        id={id}
        type="text"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        autoComplete="off"
        value={value}
        onFocus={openPop}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        ref={iconRef}
        className="date-icon-btn"
        id={`${id}IconBtn`}
        type="button"
        aria-label="Open calendar"
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else openPop()
        }}
      >
        📅
      </button>
      <div ref={popRef} className={`calendar-pop${open ? ' open' : ''}`} id={`${id}Cal`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" className="cal-nav" onClick={() => setView(new Date(year, month - 1, 1))}>
                ‹
              </button>
              <span className="cal-title">
                {MONTHS[month]} {year}
              </span>
              <button type="button" className="cal-nav" onClick={() => setView(new Date(year, month + 1, 1))}>
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
                const date = new Date(year, month, i + 1)
                const dmy = formatDMY(date)
                let cls = 'cal-day'
                if (dmy === todayStr) cls += ' today'
                if (selected && dmy === selectedStr) cls += ' selected'
                return (
                  <div
                    key={dmy}
                    className={cls}
                    data-date={dmy}
                    onClick={() => {
                      setSelected(date)
                      onChange(dmy)
                      setOpen(false)
                    }}
                  >
                    {i + 1}
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
    </div>
  )
}
