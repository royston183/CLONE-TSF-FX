import { forwardRef } from 'react'
import { MONTH_NAMES } from './data.ts'
import { calendarCells, calendarYears, shiftMonth, type CalendarView } from './logic.ts'

type Props = {
  view: CalendarView
  selected: Date | null
  today: Date
  left: number
  top: number
  onView: (v: CalendarView) => void
  onPick: (d: Date) => void
}

const DOWS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const YEARS = calendarYears()

/** The Key Date calendar popup: month and year selectors, arrows, a 6-week grid. */
export const Calendar = forwardRef<HTMLDivElement, Props>(function Calendar(
  { view, selected, today, left, top, onView, onPick },
  ref,
) {
  // A date typed outside the selectable years still needs a matching option.
  const years = YEARS.includes(view.year) ? YEARS : [...YEARS, view.year].sort((a, b) => a - b)
  return (
    <div className="calendar-pop" ref={ref} aria-hidden="false" style={{ display: 'block', left, top }}>
      <div className="cal-head">
        <button type="button" className="cal-nav" title="Previous month" onClick={() => onView(shiftMonth(view, -1))}>
          ‹
        </button>
        <select
          className="cal-select cal-month"
          value={view.month}
          onChange={(e) => onView({ ...view, month: parseInt(e.target.value, 10) })}
        >
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="cal-select cal-year"
          value={view.year}
          onChange={(e) => onView({ ...view, year: parseInt(e.target.value, 10) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className="cal-nav" title="Next month" onClick={() => onView(shiftMonth(view, 1))}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DOWS.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {calendarCells(view, selected, today).map((c, i) => (
          <button
            key={i}
            type="button"
            className={`cal-day${c.out ? ' out' : ''}${c.weekend ? ' weekend' : ''}${c.today ? ' today' : ''}${c.selected ? ' selected' : ''}`}
            onClick={() => onPick(c.date)}
          >
            {c.day}
          </button>
        ))}
      </div>
    </div>
  )
})
