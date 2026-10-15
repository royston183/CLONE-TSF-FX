import { useEffect, useState } from 'react'
import { TODAY } from './data.ts'
import { fmtDMY, sameDay } from './format.ts'
import { MONTH_NAMES, monthGrid, navMonth, viewOf, type CalendarView } from './logic.ts'
import { CalendarSelects } from '../../shared/fx/CalendarSelects.tsx'

type Props = {
  /** DD-MM-YYYY. */
  value: string
  /** Month shown the first time, before a value steers it. */
  initialView: CalendarView
  open: boolean
  onToggle: () => void
  onPick: (dmy: string) => void
  label: string
}

/** The page's lightweight dd-mm-yyyy calendar: a read-only input, an icon button and a popup. */
export function DatePicker({ value, initialView, open, onToggle, onPick, label }: Props) {
  const [view, setView] = useState<CalendarView>(initialView)

  // Opening re-centres the calendar on the current value.
  useEffect(() => {
    if (open) setView((v) => viewOf(value, v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const { blanks, days } = monthGrid(view)

  return (
    <div className="dp">
      <input type="text" readOnly value={value} aria-label={label} onClick={onToggle} />
      <button type="button" className="dp-btn" onClick={onToggle} aria-label="Open calendar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <div className={open ? 'dp-popup open' : 'dp-popup'}>
        {open && (
          <>
            <div className="dp-head">
              <button type="button" onClick={() => setView((v) => navMonth(v, -1))}>
                &lsaquo;
              </button>
              <CalendarSelects year={view.y} month={view.m} onChange={(y, m) => setView({ y, m })} />
              <button type="button" onClick={() => setView((v) => navMonth(v, 1))}>
                &rsaquo;
              </button>
            </div>
            <div className="dp-grid">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="dp-dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <div key={`b${i}`} className="dp-day blank" />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = i + 1
                const cur = new Date(view.y, view.m, day)
                const cls = `dp-day${sameDay(cur, TODAY) ? ' today' : ''}${fmtDMY(cur) === value ? ' selected' : ''}`
                return (
                  <button key={day} type="button" className={cls} onClick={() => onPick(fmtDMY(cur))}>
                    {day}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
