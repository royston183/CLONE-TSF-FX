import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatInputDate, parseDate } from './helpers.ts'

export type DateFieldProps = {
  id?: string | undefined
  value: string
  onChange: (value: string) => void
  /** Fires when the value is committed — blur, or a pick in the calendar popup. */
  onCommit: (value: string) => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  shellClassName?: string | undefined
  inputClassName?: string | undefined
}

/**
 * The legacy inline date input and its calendar popup (the shared DatePopup).
 *
 * Which field's popup is open lives in the parent, because the original allows only one at
 * a time.
 */
export function DateField({
  id,
  value,
  onChange,
  onCommit,
  open,
  onToggle,
  onClose,
  shellClassName,
  inputClassName,
}: DateFieldProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)

  function pick(date: Date) {
    const next = formatInputDate(date)
    onChange(next)
    onClose()
    onCommit(next)
  }

  return (
    <div className={shellClassName ? `inline-date-shell ${shellClassName}` : 'inline-date-shell'} ref={shellRef}>
      <input
        id={id}
        className={inputClassName ? `inline-date-input ${inputClassName}` : 'inline-date-input'}
        type="text"
        placeholder="DD-MM-YYYY"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
      />
      <button
        className="inline-calendar-btn"
        type="button"
        aria-label="Open calendar"
        onClick={onToggle}
      />
      <DatePopup open={open} anchorRef={shellRef} value={parseDate(value)} onSelect={pick} onClose={onClose} />
    </div>
  )
}
