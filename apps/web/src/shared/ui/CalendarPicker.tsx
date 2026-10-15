import { useCallback, useRef, useState } from 'react'
import { DatePopup } from './DatePopup.tsx'
import { dateToIso, isoToDate } from './DateInput.tsx'

/**
 * Drop-in for the legacy `<input type="date" className="calendar-native">` laid invisibly over a
 * small calendar icon inside a `.date-input-wrap`. That overlay opened the browser's own picker;
 * this opens the shared calendar (DatePopup) instead, hung from the whole `.date-input-wrap`.
 *
 * It keeps the overlay's contract: `onChange` receives an event-like `{ target: { value } }` with
 * the picked date as yyyy-mm-dd, so each screen's existing handler works unchanged. It renders as a
 * transparent button carrying the same class, so the existing `.calendar-native` rule (absolute,
 * inset 0, opacity 0) still places it over the icon.
 */
export function CalendarPicker({
  value = '',
  onChange,
  disabled,
  className,
  id,
  'aria-label': ariaLabel = 'Open calendar',
}: {
  /** yyyy-mm-dd of the date to highlight, when the screen knows it. */
  value?: string
  onChange: (event: { target: { value: string } }) => void
  disabled?: boolean | undefined
  className?: string | undefined
  id?: string | undefined
  'aria-label'?: string
}) {
  const button = useRef<HTMLButtonElement>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  const toggle = () => {
    if (!open) anchor.current = button.current?.closest<HTMLElement>('.date-input-wrap') ?? button.current
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={toggle}
      />
      <DatePopup
        open={open && !disabled}
        anchorRef={anchor}
        value={isoToDate(value)}
        title="Date"
        onSelect={(d) => {
          onChange({ target: { value: dateToIso(d) } })
          setOpen(false)
        }}
        onClose={close}
      />
    </>
  )
}
