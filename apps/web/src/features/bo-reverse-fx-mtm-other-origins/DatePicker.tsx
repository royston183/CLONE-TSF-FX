import type { Ref } from 'react'
import { sameDay } from './format.ts'
import {
  CALENDAR_FIRST_YEAR,
  CALENDAR_LAST_YEAR,
  MONTH_NAMES,
  calendarCells,
  shiftMonth,
} from './logic.ts'
import type { CalendarView } from './types.ts'

type Props = {
  popRef: Ref<HTMLDivElement>
  open: boolean
  left: number
  top: number
  view: CalendarView
  selected: Date | null
  today: Date
  onView: (v: CalendarView) => void
  onPick: (d: Date) => void
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const YEARS = Array.from({ length: CALENDAR_LAST_YEAR - CALENDAR_FIRST_YEAR + 1 }, (_, i) => CALENDAR_FIRST_YEAR + i)

/** The page's floating month calendar, positioned under the Key Date field. */
export function CalendarPopup({ popRef, open, left, top, view, selected, today, onView, onPick }: Props) {
  return (
    <div
      className="calendar-pop"
      ref={popRef}
      aria-hidden={!open}
      style={open ? { display: 'block', left, top } : undefined}
    >
      <div className="cal-head">
        <button type="button" className="cal-nav" title="Previous month" onClick={() => onView(shiftMonth(view, -1))}>
          &lsaquo;
        </button>
        <select
          className="cal-select cal-month"
          value={view.m}
          onChange={(e) => onView({ y: view.y, m: parseInt(e.target.value, 10) })}
        >
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="cal-select cal-year"
          value={view.y}
          onChange={(e) => onView({ y: parseInt(e.target.value, 10), m: view.m })}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className="cal-nav" title="Next month" onClick={() => onView(shiftMonth(view, 1))}>
          &rsaquo;
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {calendarCells(view).map((c) => {
          const cls =
            'cal-day' +
            (c.out ? ' out' : '') +
            (c.weekend ? ' weekend' : '') +
            (sameDay(c.date, today) ? ' today' : '') +
            (selected && sameDay(c.date, selected) ? ' selected' : '')
          return (
            <button key={c.date.getTime()} type="button" className={cls} onClick={() => onPick(c.date)}>
              {c.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
