import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MONTH_NAMES, WEEKDAYS } from './data.ts'
import { useFloatingPanel } from './floating.ts'
import { dateToISO, formatDMY, parseDMY } from './format.ts'
import { calendarGrid, shiftMonth, typedDateOnCommit, typedDateOnInput, viewForText, yearRange } from './logic.ts'

/**
 * The Key Date box (#field-keyDate): a dd-mm-yyyy text input with a calendar pop-up that has
 * month and year selectors. Typed text is applied as soon as it is a complete valid date; on
 * blur / Enter an invalid text shows the error state. The calendar's month on show is set only
 * when it opens (and when a complete date is typed), never on re-render, so month / year
 * navigation keeps working on a populated field.
 */
export function DateField({
  text,
  error,
  onText,
  onError,
  onCommit,
}: {
  /** The input's text. */
  text: string
  error: boolean
  onText: (text: string) => void
  onError: (error: boolean) => void
  /** The applied Key Date as ISO, or '' when cleared. */
  onCommit: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => viewForText(''))
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
    contentKey: `${view.year}-${view.month}`,
  })

  // Escape closes the calendar wherever the focus is.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const openCalendar = () => {
    setView(viewForText(text))
    setOpen(true)
  }
  const toggle = () => {
    if (open) setOpen(false)
    else openCalendar()
  }

  const onInput = (value: string) => {
    onText(value)
    const r = typedDateOnInput(value)
    if (r.kind === 'clear') {
      onError(false)
      onCommit('')
    } else if (r.kind === 'commit') {
      onError(false)
      setView(r.view)
      onCommit(r.iso)
    }
  }

  const commitTyped = () => {
    const r = typedDateOnCommit(text)
    if (r.kind === 'clear') {
      onError(false)
      onCommit('')
    } else if (r.kind === 'commit') {
      onText(r.text)
      onError(false)
      onCommit(r.iso)
    } else if (r.kind === 'error') {
      onError(true)
    }
  }

  const pick = (day: number) => {
    const picked = new Date(view.year, view.month, day)
    onText(formatDMY(picked))
    onError(false)
    setOpen(false)
    onCommit(dateToISO(picked))
  }

  const selected = parseDMY(text)
  const selectedTime = selected ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime() : null
  const today = new Date().toDateString()
  const grid = calendarGrid(view.year, view.month)

  const onDayKey = (e: KeyboardEvent<HTMLDivElement>, day: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(day)
    }
  }

  return (
    <div className={`tb-field${error ? ' has-error' : ''}`} id="field-keyDate">
      <div ref={wrapRef} className="date-field">
        <input
          className="control"
          id="input-keyDate"
          placeholder="Key Date"
          maxLength={10}
          autoComplete="off"
          aria-label="Key Date"
          title="Key Date (dd-mm-yyyy) — deals whose maturity date equals this date"
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onClick={() => {
            if (!open) openCalendar()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter') {
              commitTyped()
              close()
            }
          }}
          onBlur={commitTyped}
        />
        <button
          type="button"
          className="date-icon"
          data-target="keyDate"
          aria-label="Open calendar"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          &#128197;
        </button>
        <div ref={panelRef} className={`date-popup${open ? ' open' : ''}`} id="popup-keyDate">
          {open ? (
            <>
              <div className="cal-head">
                <button type="button" aria-label="Previous month" onClick={() => setView((v) => shiftMonth(v, -1))}>
                  {'‹'}
                </button>
                <span className="cal-selects">
                  <select
                    className="cal-sel"
                    aria-label="Month"
                    value={view.month}
                    onChange={(e) => setView((v) => ({ ...v, month: parseInt(e.target.value, 10) }))}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    className="cal-sel"
                    aria-label="Year"
                    value={view.year}
                    onChange={(e) => setView((v) => ({ ...v, year: parseInt(e.target.value, 10) }))}
                  >
                    {yearRange(view.year).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </span>
                <button type="button" aria-label="Next month" onClick={() => setView((v) => shiftMonth(v, 1))}>
                  {'›'}
                </button>
              </div>
              <div className="cal-grid">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="dow">
                    {d}
                  </div>
                ))}
                {grid.leading.map((d) => (
                  <div key={`p${d}`} className="day muted">
                    {d}
                  </div>
                ))}
                {Array.from({ length: grid.daysInMonth }, (_, i) => {
                  const day = i + 1
                  const dt = new Date(view.year, view.month, day)
                  let cls = 'day'
                  if (selectedTime !== null && dt.getTime() === selectedTime) cls += ' selected'
                  if (dt.toDateString() === today) cls += ' today'
                  return (
                    <div
                      key={day}
                      className={cls}
                      data-day={day}
                      role="button"
                      tabIndex={0}
                      onClick={() => pick(day)}
                      onKeyDown={(e) => onDayKey(e, day)}
                    >
                      {day}
                    </div>
                  )
                })}
                {grid.trailing.map((d) => (
                  <div key={`n${d}`} className="day muted">
                    {d}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="tb-error" id="error-keyDate">
        Enter a valid date (dd-mm-yyyy)
      </div>
    </div>
  )
}
