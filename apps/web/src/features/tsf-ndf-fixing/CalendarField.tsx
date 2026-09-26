import { useEffect, useRef, useState } from 'react'
import { fmtDate, isoFromDisplay } from './format.ts'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The Fixing Date filter box with the original's fixed-position pop-up calendar (the vanilla
 * page measured the input's bounding rect on open; this does the same via a ref instead of
 * anchoring in CSS, since the calendar is rendered at the document root there too).
 */
export function CalendarField({ value, onChange }: { value: string; onChange: (dmy: string) => void }) {
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const parsed = isoFromDisplay(value)
    return new Date((parsed ?? today).getFullYear(), (parsed ?? today).getMonth(), 1)
  })
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!calRef.current?.contains(t) && !(t instanceof Element && t.closest('.date-wrap'))) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const openCalendar = () => {
    const parsed = isoFromDisplay(value) ?? today
    setMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1))
    const r = inputRef.current?.getBoundingClientRect()
    if (r) {
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 286)),
        top: Math.min(r.bottom + 5, window.innerHeight - 320),
      })
    }
    setOpen(true)
  }

  const onTyped = (raw: string) => {
    let v = raw.replace(/\D/g, '').slice(0, 8)
    if (v.length > 4) v = `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`
    else if (v.length > 2) v = `${v.slice(0, 2)}-${v.slice(2)}`
    onChange(v)
  }

  const y = month.getFullYear()
  const m = month.getMonth()
  const first = new Date(y, m, 1)
  const start = (first.getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const prevDays = new Date(y, m, 0).getDate()
  const selected = isoFromDisplay(value)

  const cells: Array<{ d: number; mm: number; yy: number; muted: boolean }> = []
  for (let i = 0; i < 42; i++) {
    if (i < start) cells.push({ d: prevDays - start + i + 1, mm: m - 1, yy: y, muted: true })
    else if (i >= start + days) cells.push({ d: i - start - days + 1, mm: m + 1, yy: y, muted: true })
    else cells.push({ d: i - start + 1, mm: m, yy: y, muted: false })
  }

  return (
    <div className="date-wrap toolbar-date">
      <input
        ref={inputRef}
        className="filter-control"
        placeholder="Fixing Date"
        maxLength={10}
        value={value}
        onClick={openCalendar}
        onChange={(e) => onTyped(e.target.value)}
      />
      <button type="button" className="calbtn" onClick={openCalendar}>
        ▣
      </button>
      {open ? (
        <div className="calendar show" ref={calRef} style={{ left: pos.left, top: pos.top }}>
          <div className="cal-head">
            <button type="button" onClick={() => setMonth(new Date(y, m - 1, 1))}>
              ‹
            </button>
            <div className="cal-title">
              {month.toLocaleString('en', { month: 'long' })} {y}
            </div>
            <button type="button" onClick={() => setMonth(new Date(y, m + 1, 1))}>
              ›
            </button>
          </div>
          <div className="cal-grid">
            {DOW.map((n) => (
              <div key={n} className="dow">
                {n}
              </div>
            ))}
            {cells.map((c, i) => {
              const dt = new Date(c.yy, c.mm, c.d)
              const isToday = fmtDate(dt) === fmtDate(today)
              const isSel = !!selected && fmtDate(dt) === fmtDate(selected)
              return (
                <div
                  key={i}
                  className={`day${c.muted ? ' muted' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}`}
                  onClick={() => {
                    onChange(fmtDate(dt))
                    setOpen(false)
                  }}
                >
                  {c.d}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
