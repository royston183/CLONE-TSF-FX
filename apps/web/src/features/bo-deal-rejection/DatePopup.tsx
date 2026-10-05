import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { MONTH_NAMES } from './data.ts'
import { calendarCells, calendarYears, monthLabel, shiftMonth } from './logic.ts'
import type { CalendarView } from './types.ts'

type Props = {
  view: CalendarView
  /** The date currently typed in the box, when it is a real date. */
  selected: Date | null
  /** The field the popup hangs from; it is placed under it (or above when there is no room). */
  anchorRef: RefObject<HTMLDivElement | null>
  onView: (v: CalendarView) => void
  onPick: (d: Date) => void
  onClose: () => void
}

const DOWS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The Upto Blotter Date calendar: month and year selectors, arrows, Today and Close. */
export function DatePopup({ view, selected, anchorRef, onView, onPick, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)

  // Fixed placement, right-aligned to the field, flipped above it when it would leave the window.
  const position = () => {
    const popup = popupRef.current
    const wrap = anchorRef.current
    if (!popup || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const pr = popup.getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.right - pr.width), window.innerWidth - pr.width - 8)
    let top = rect.bottom + 6
    if (top + pr.height > window.innerHeight - 8) top = Math.max(8, rect.top - 6 - pr.height)
    popup.style.position = 'fixed'
    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
    popup.style.right = 'auto'
    popup.style.bottom = 'auto'
  }
  useLayoutEffect(position)
  useEffect(() => {
    window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  })

  const today = new Date()
  return (
    <div className="date-popup open" id="popup-uptoDate" ref={popupRef}>
      <div className="cal-head">
        <button type="button" aria-label="Previous month" onClick={() => onView(shiftMonth(view, -1))}>
          ‹
        </button>
        <span className="cal-selects">
          <select
            id="calMonth"
            aria-label="Month"
            value={view.month}
            onChange={(e) => onView({ ...view, month: parseInt(e.target.value, 10) })}
          >
            {MONTH_NAMES.map((_, m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select
            id="calYear"
            aria-label="Year"
            value={view.year}
            onChange={(e) => onView({ ...view, year: parseInt(e.target.value, 10) })}
          >
            {calendarYears(view.year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </span>
        <button type="button" aria-label="Next month" onClick={() => onView(shiftMonth(view, 1))}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DOWS.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
        {calendarCells(view, selected, today).map((c, i) =>
          c.muted ? (
            <div key={i} className="day muted">
              {c.day}
            </div>
          ) : (
            <div
              key={i}
              className={`day${c.selected ? ' selected' : ''}${c.today ? ' today' : ''}`}
              onClick={() => onPick(new Date(view.year, view.month, c.day))}
            >
              {c.day}
            </div>
          ),
        )}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn btn-ghost" id="calToday" onClick={() => onPick(new Date())}>
          Today
        </button>
        <button type="button" className="btn btn-ghost" id="calClose" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
