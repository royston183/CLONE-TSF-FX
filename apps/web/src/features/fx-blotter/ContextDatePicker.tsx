import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fmtDate } from './format.ts'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

// The original drew the calendar with inline styles; they are kept verbatim.
const POPUP: CSSProperties = {
  position: 'absolute',
  top: 4,
  left: 0,
  zIndex: 60,
  width: 236,
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-pop)',
  padding: 10,
}
const NAV_BTN: CSSProperties = {
  width: 24,
  height: 24,
  border: 0,
  background: '#EEF2F6',
  borderRadius: 6,
  cursor: 'pointer',
}
const DAY: CSSProperties = { textAlign: 'center', padding: '6px 0', fontSize: 11.5 }

/** "Blotter Date (Today)": a read-only box that opens a small month calendar. */
export function ContextDatePicker({ date, onPick }: { date: Date; onPick: (d: Date) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1))
  const popRef = useRef<HTMLDivElement>(null)

  // A click anywhere but the calendar or its box closes it.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (popRef.current && !popRef.current.contains(t) && t?.id !== 'ctx-date') setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const toggle = () => {
    if (!open) setView(new Date(date.getFullYear(), date.getMonth(), 1))
    setOpen(!open)
  }

  const y = view.getFullYear()
  const m = view.getMonth()
  const firstDow = new Date(y, m, 1).getDay()
  const prevDays = daysInMonth(y, m === 0 ? 11 : m - 1)
  const shift = (delta: number) => setView(new Date(y, m + delta, 1))

  return (
    <div className="context-field tight">
      <label htmlFor="ctx-date">Blotter Date (Today)</label>
      <input id="ctx-date" type="text" readOnly value={fmtDate(date)} onClick={toggle} />
      <div className="dp-popup-anchor" style={{ position: 'relative' }}>
        <div className="dp-popup" id="ctx-dp-popup" ref={popRef} style={{ ...POPUP, display: open ? 'block' : 'none' }}>
          {open ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button type="button" style={NAV_BTN} onClick={() => shift(-1)}>
                  ‹
                </button>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {MONTH_ABBR[m]} {y}
                </span>
                <button type="button" style={NAV_BTN} onClick={() => shift(1)}>
                  ›
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {DOW_LABELS.map((dw) => (
                  <div
                    key={dw}
                    style={{
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-faint)',
                      padding: '4px 0',
                    }}
                  >
                    {dw}
                  </div>
                ))}
                {Array.from({ length: firstDow }, (_, i) => (
                  <div key={`p${i}`} style={{ ...DAY, color: '#c9d2dc' }}>
                    {prevDays - firstDow + 1 + i}
                  </div>
                ))}
                {Array.from({ length: daysInMonth(y, m) }, (_, i) => {
                  const d = i + 1
                  const sel = date.getFullYear() === y && date.getMonth() === m && date.getDate() === d
                  return (
                    <div
                      key={d}
                      style={{
                        ...DAY,
                        borderRadius: 6,
                        cursor: 'pointer',
                        ...(sel ? { background: 'var(--primary)', color: '#fff', fontWeight: 700 } : null),
                      }}
                      onClick={() => {
                        onPick(new Date(y, m, d))
                        setOpen(false)
                      }}
                    >
                      {d}
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
