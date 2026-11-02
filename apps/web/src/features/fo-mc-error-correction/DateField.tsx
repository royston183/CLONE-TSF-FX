import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

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
  const wrapRef = useRef<HTMLDivElement>(null)
  /** The text when the box gained focus, to tell whether leaving it is a "change". */
  const focusValue = useRef(value)

  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  const pick = (date: Date) => {
    const picked = formatDMY(date)
    setOpen(false)
    focusValue.current = picked
    onInput(picked)
    if (onPick) onPick(picked)
    else onCommit?.(picked)
  }

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
      <DatePopup open={open} anchorRef={wrapRef} value={parseDMY(value)} title={title ?? 'Date'} onSelect={pick} onClose={close} />
    </div>
  )
}
