import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

/** A DD-MM-YYYY text box with the shared calendar popup. */
export function DateField({
  id,
  value,
  onChange,
  placeholder,
  onPicked,
  className = 'control filter-input date-field',
}: {
  id?: string | undefined
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  /** A date was chosen from the calendar (the caller can clear its own field error here). */
  onPicked?: (() => void) | undefined
  className?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  const pick = (day: Date) => {
    onChange(formatDate(day))
    setOpen(false)
    onPicked?.()
  }

  return (
    <div ref={wrapRef} className="date-shell">
      <input id={id} className={className} type="text" placeholder={placeholder} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="cal-icon" type="button" title="Choose date" onClick={toggle}>
        ▣
      </button>
      <DatePopup open={open} anchorRef={wrapRef} value={parseDate(value)} onSelect={pick} onClose={close} title="Date" />
    </div>
  )
}
