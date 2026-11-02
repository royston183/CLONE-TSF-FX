import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

/** A DD-MM-YYYY text box with the shared calendar popup. */
export function DateField({
  value,
  onChange,
  onPicked,
  min,
}: {
  value: string
  onChange: (value: string) => void
  /** A date was chosen from the calendar (the original clears the field's error then). */
  onPicked?: (() => void) | undefined
  /** Earlier days are shown in the calendar but cannot be picked. */
  min?: Date | undefined
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-field">
      <input
        className="control"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={toggle}
      />
      <button type="button" className="date-icon" onClick={toggle}>
        📅
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title="Date"
        min={min}
        onSelect={(date) => {
          onChange(formatDMY(date))
          setOpen(false)
          onPicked?.()
        }}
        onClose={close}
      />
    </div>
  )
}
