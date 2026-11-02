import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

/**
 * The Fixing Date box with the shared pop-up calendar. It opens on focus, and closes when a day
 * is picked or on a click outside the box and calendar. Typing is free-form; View Deals
 * validates it.
 */
export function FixingDateField({
  value,
  invalid,
  onType,
  onPick,
}: {
  value: string
  invalid: boolean
  onType: (raw: string) => void
  /** A day was chosen from the calendar; the text is DD-MM-YYYY. */
  onPick: (dmy: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  // A half-typed date parses to an Invalid Date: show no selection then.
  const parsed = value ? parseDMY(value) : null
  const selected = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null

  return (
    <div className="dropdown-wrap" ref={wrapRef}>
      <input
        type="text"
        id="fixingDateInput"
        className={`input${invalid ? ' error' : ''}`}
        placeholder="dd-mm-yyyy"
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => onType(e.target.value)}
      />
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={selected}
        title="Fixing Date"
        onSelect={(d) => {
          onPick(formatDMY(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
