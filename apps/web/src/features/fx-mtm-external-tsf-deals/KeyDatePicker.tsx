import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { formatDMY, parseDMY } from './format.ts'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const FIRST_YEAR = 2018
const LAST_YEAR = 2040
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)

type View = { y: number; m: number }

function shift(view: View, by: number): View {
  const d = new Date(view.y, view.m + by, 1)
  return { y: d.getFullYear(), m: d.getMonth() }
}

/**
 * The Key Date box with its pop-up calendar (month and year selectors). The visible month is
 * set only when the popup opens, so month navigation keeps working when the field already
 * holds a date.
 */
export function KeyDatePicker({
  value,
  onInput,
  onCommit,
  onPick,
}: {
  value: string
  /** Every keystroke. */
  onInput: (value: string) => void
  /** The typed text was committed (blur after an edit, or Enter): normalise and validate it. */
  onCommit: () => void
  /** A day was chosen in the calendar. */
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ y: 2026, m: 8 })
  const dirty = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { alignRight: true, gap: 6 },
    onOutside: close,
    onScrollAway: close,
    contentKey: `${view.y}-${view.m}`,
  })

  const openCalendar = () => {
    const base = parseDMY(value) ?? new Date()
    setView({ y: base.getFullYear(), m: base.getMonth() })
    setOpen(true)
  }

  const selected = parseDMY(value)
  const offset = new Date(view.y, view.m, 1).getDay()
  const dim = new Date(view.y, view.m + 1, 0).getDate()
  const dimPrev = new Date(view.y, view.m, 0).getDate()
  const trailing = (7 - ((offset + dim) % 7)) % 7
  const today = new Date().toDateString()

  return (
    <div ref={wrapRef} className="date-field">
      <input
        id="input-keyDate"
        className="control"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          dirty.current = true
          onInput(e.target.value)
        }}
        onBlur={() => {
          if (!dirty.current) return
          dirty.current = false
          onCommit()
        }}
        onClick={() => {
          if (!open) openCalendar()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          dirty.current = false
          onCommit()
          setOpen(false)
        }}
      />
      <button
        type="button"
        className="date-icon"
        aria-label="Open calendar"
        onClick={() => {
          if (open) setOpen(false)
          else openCalendar()
        }}
      >
        &#128197;
      </button>
      <div ref={panelRef} className={`date-popup${open ? ' open' : ''}`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" aria-label="Previous month" onClick={() => setView(shift(view, -1))}>
                &#8249;
              </button>
              <span className="cal-selects">
                <select aria-label="Month" value={view.m} onChange={(e) => setView({ ...view, m: parseInt(e.target.value, 10) })}>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
                <select aria-label="Year" value={view.y} onChange={(e) => setView({ ...view, y: parseInt(e.target.value, 10) })}>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
              <button type="button" aria-label="Next month" onClick={() => setView(shift(view, 1))}>
                &#8250;
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`p${i}`} className="day muted">
                  {dimPrev - offset + 1 + i}
                </div>
              ))}
              {Array.from({ length: dim }, (_, i) => {
                const day = i + 1
                const dt = new Date(view.y, view.m, day)
                let cls = 'day'
                if (selected && dt.getTime() === new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime())
                  cls += ' selected'
                if (dt.toDateString() === today) cls += ' today'
                return (
                  <div
                    key={day}
                    className={cls}
                    onClick={() => {
                      dirty.current = false
                      setOpen(false)
                      onPick(formatDMY(dt))
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
