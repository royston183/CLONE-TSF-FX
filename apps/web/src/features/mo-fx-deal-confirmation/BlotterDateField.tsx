import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, parseDDMMYYYY } from './format.ts'

/**
 * Upto Blotter Date: a free-text DD-MM-YYYY input with the shared popup calendar. The calendar
 * opens from the icon (which toggles it) or when the input takes focus, and closes on a day
 * pick or any click outside the field.
 *
 * `invalid` puts has-error on the .date-field wrapper, where the page put it. The page's
 * error styles are all keyed on `.field.has-error`, so — as there — that shows nothing; the
 * visible effect of a missing date is that View Deals does not run.
 */
export function BlotterDateField({
  value,
  invalid,
  onChange,
}: {
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className={`date-field${invalid ? ' has-error' : ''}`} id="blotterDateField" ref={fieldRef}>
      <input
        className="input"
        id="blotterDateInput"
        placeholder="dd-mm-yyyy"
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="date-icon-btn"
        id="blotterDateIcon"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        &#128197;
      </button>
      <DatePopup
        open={open}
        anchorRef={fieldRef}
        value={parseDDMMYYYY(value)}
        title="Upto Blotter Date"
        onSelect={(d) => {
          onChange(fmtDate(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
