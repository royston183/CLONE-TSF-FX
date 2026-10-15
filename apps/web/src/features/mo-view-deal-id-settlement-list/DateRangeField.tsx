import { daysInMonth, leadingBlanks } from './logic.ts'
import { MONTH_ABBR, fmtDate, parseDate } from './format.ts'
import { CalendarSelects } from '../../shared/fx/CalendarSelects.tsx'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/**
 * One date box of the Value Date range: a read-only DD.MM.YYYY input, a calendar button and
 * the pop-up month calendar. The open state and the month on show are the page's, because
 * only one popup is open at a time and Escape / outside click close it from there.
 */
export function DateBox({
  placeholder,
  value,
  open,
  viewYear,
  viewMonth,
  onToggle,
  onNav,
  onPick,
}: {
  placeholder: string
  value: string
  open: boolean
  viewYear: number
  viewMonth: number
  onToggle: () => void
  onNav: (delta: number) => void
  onPick: (value: string) => void
}) {
  const selected = value ? parseDate(value) : null
  const today = new Date()
  return (
    <div className="dp">
      <input type="text" value={value} placeholder={placeholder} readOnly onClick={onToggle} />
      <button type="button" className="dp-btn" onClick={onToggle} aria-label="Open calendar">
        <CalendarIcon />
      </button>
      <div className={open ? 'dp-popup open' : 'dp-popup'}>
        {open ? (
          <>
            <div className="dp-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => onNav(-1)}>
                &#8249;
              </button>
              <CalendarSelects year={viewYear} month={viewMonth} onChange={(y, m) => onNav((y - viewYear) * 12 + (m - viewMonth))} />
              <button type="button" onClick={() => onNav(1)}>
                &#8250;
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center' }}>
              {DOW.map((d, i) => (
                <div key={i} className="dp-dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: leadingBlanks(viewYear, viewMonth) }, (_, i) => (
                <div key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth(viewYear, viewMonth) }, (_, i) => {
                const day = i + 1
                const d = new Date(viewYear, viewMonth, day)
                let cls = 'dp-day'
                if (selected && d.getTime() === selected.getTime()) cls += ' selected'
                if (d.toDateString() === today.toDateString()) cls += ' today'
                return (
                  <div key={day} className={cls} onClick={() => onPick(fmtDate(d))}>
                    {day}
                  </div>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
