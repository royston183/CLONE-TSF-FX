import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDateDigits, formatDateParts, parseDateParts } from './dates.ts'

export type DateFieldProps = {
  id?: string | undefined
  className?: string | undefined
  placeholder?: string | undefined
  value: string
  readOnly?: boolean | undefined
  onChange: (value: string) => void
}

function toDate(value: string): Date | null {
  const parts = parseDateParts(value)
  if (!parts) return null
  const date = new Date(parts.year, parts.month, parts.day)
  return date.getMonth() === parts.month && date.getDate() === parts.day ? date : null
}

/**
 * A DD-MM-YYYY text box with a calendar button beside it, inside `.date-field-wrap` so the
 * generated stylesheet lays it out. The text is the value — half-typed entries are kept as
 * typed, exactly as the original does, and the callers all treat an unparseable date as
 * "no date".
 */
export function DateField({ id, className, placeholder, value, readOnly, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="date-field-wrap" ref={wrapRef}>
      <input
        type="text"
        id={id}
        className={className}
        placeholder={placeholder ?? 'DD-MM-YYYY'}
        value={value}
        readOnly={readOnly}
        inputMode="numeric"
        onChange={(event) => onChange(formatDateDigits(event.target.value))}
      />
      <button
        type="button"
        className="date-cal-btn"
        aria-label="Open calendar"
        onClick={(event) => {
          event.stopPropagation()
          if (readOnly) return
          setOpen((current) => !current)
        }}
      >
        {'\u{1F4C5}'}
      </button>
      <DatePopup
        open={open && !readOnly}
        anchorRef={wrapRef}
        value={toDate(value)}
        onSelect={(d) => {
          onChange(formatDateParts(d.getFullYear(), d.getMonth(), d.getDate()))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
