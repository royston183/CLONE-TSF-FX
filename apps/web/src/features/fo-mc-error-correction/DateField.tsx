import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { formatDMY, parseDMY } from './format.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * A DD-MM-YYYY text box with the original's pop-up month calendar.
 *
 * The original listened to three different things on these boxes, and the screen relies on
 * the difference, so they stay separate: `onInput` for each keystroke, `onPick` for a day
 * chosen in the calendar, and `onCommit` for the browser's native "change" — which fires on
 * leaving a box whose text was edited, and which a calendar pick also raises unless the box
 * has an `onPick` of its own.
 */
export function DateField({
  value,
  onInput,
  onPick,
  onCommit,
  className = '',
  inputClassName = 'control',
  placeholder = 'DD-MM-YYYY',
  title,
  iconText = '📅',
  iconLabel,
}: {
  value: string
  onInput: (value: string) => void
  onPick?: ((value: string) => void) | undefined
  onCommit?: ((value: string) => void) | undefined
  className?: string | undefined
  inputClassName?: string | undefined
  placeholder?: string | undefined
  title?: string | undefined
  iconText?: string | undefined
  iconLabel?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** The text when the box gained focus, to tell whether leaving it is a "change". */
  const focusValue = useRef(value)

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { alignRight: true, gap: 6 },
    onOutside: close,
    contentKey: `${view.getFullYear()}-${view.getMonth()}`,
  })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const base = parseDMY(value) ?? new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const pick = (date: Date) => {
    const picked = formatDMY(date)
    setOpen(false)
    focusValue.current = picked
    onInput(picked)
    if (onPick) onPick(picked)
    else onCommit?.(picked)
  }

  const selected = parseDMY(value)
  const year = view.getFullYear()
  const month = view.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7
  const today = new Date().toDateString()

  return (
    <div ref={wrapRef} className={`date-field${className ? ` ${className}` : ''}`}>
      <input
        className={inputClassName}
        placeholder={placeholder}
        autoComplete="off"
        title={title}
        value={value}
        onFocus={(e) => {
          focusValue.current = e.target.value
        }}
        onChange={(e) => onInput(e.target.value)}
        onBlur={(e) => {
          if (e.target.value !== focusValue.current) {
            focusValue.current = e.target.value
            onCommit?.(e.target.value)
          }
        }}
        onClick={toggle}
      />
      <button type="button" className="date-icon" aria-label={iconLabel} onClick={toggle}>
        {iconText}
      </button>
      <div ref={panelRef} className={`date-popup${open ? ' open' : ''}`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
                ‹
              </button>
              <span className="cal-title">
                {MONTHS[month]} {year}
              </span>
              <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: startOffset }, (_, i) => (
                <div key={`p${i}`} className="day muted">
                  {daysInPrevMonth - startOffset + 1 + i}
                </div>
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const date = new Date(year, month, day)
                let cls = 'day'
                if (selected && date.getTime() === new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime())
                  cls += ' selected'
                if (date.toDateString() === today) cls += ' today'
                return (
                  <div key={day} className={cls} onClick={() => pick(date)}>
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
