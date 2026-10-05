import { CALENDAR_YEARS } from './data.ts'
import { MONTH_NAMES, sameDay } from './format.ts'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const YEARS = Array.from({ length: CALENDAR_YEARS.to - CALENDAR_YEARS.from + 1 }, (_, i) => CALENDAR_YEARS.from + i)

/** The Key Date calendar: a fixed-position 6x7 grid with month/year selects and previous/next arrows. */
export function CalendarPopup({
  open,
  left,
  top,
  year,
  month,
  selected,
  onShift,
  onMonth,
  onYear,
  onPick,
}: {
  open: boolean
  left: number
  top: number
  year: number
  month: number
  selected: Date | null
  onShift: (delta: number) => void
  onMonth: (month: number) => void
  onYear: (year: number) => void
  onPick: (date: Date) => void
}) {
  const start = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const today = new Date()

  const cells = Array.from({ length: 42 }, (_, cell) => {
    let num: number
    let date: Date
    let cls = ''
    if (cell < start) {
      num = prevDays - start + cell + 1
      date = new Date(year, month - 1, num)
      cls = ' out'
    } else if (cell >= start + days) {
      num = cell - start - days + 1
      date = new Date(year, month + 1, num)
      cls = ' out'
    } else {
      num = cell - start + 1
      date = new Date(year, month, num)
    }
    if (date.getDay() === 0 || date.getDay() === 6) cls += ' weekend'
    if (sameDay(today, date)) cls += ' today'
    if (sameDay(selected, date)) cls += ' selected'
    return { num, date, cls }
  })

  return (
    <div
      className="calendar-pop"
      id="calendarPop"
      aria-hidden={!open}
      style={{ display: open ? 'block' : 'none', left, top }}
    >
      <div className="cal-head">
        <button className="cal-nav" type="button" title="Previous month" onClick={() => onShift(-1)}>
          ‹
        </button>
        <select className="cal-select cal-month" value={month} onChange={(e) => onMonth(parseInt(e.target.value, 10))}>
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select className="cal-select cal-year" value={year} onChange={(e) => onYear(parseInt(e.target.value, 10))}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button className="cal-nav" type="button" title="Next month" onClick={() => onShift(1)}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`cal-day${c.cls}`}
            onClick={(e) => {
              e.stopPropagation()
              onPick(c.date)
            }}
          >
            {c.num}
          </button>
        ))}
      </div>
    </div>
  )
}
