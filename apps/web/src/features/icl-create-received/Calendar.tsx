import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './dates.ts'

type CalendarProps = {
  /** The date field's current text, used to highlight the selected day. */
  value: string
  onSelect: (formatted: string) => void
  /** Kept for the caller; the shared popup has no Clear button (clear the text box instead). */
  onClear?: () => void
  /** Called when the popup is dismissed (outside click / Escape) without a pick. */
  onClose?: () => void
}

/**
 * The calendar popup (`#uptoCalendar` / `#plannedCalendar` in the original), shared by both
 * date fields. It renders the shared DatePopup, anchored to the field wrapper it is mounted in.
 */
export function Calendar({ value, onSelect, onClose }: CalendarProps) {
  const anchor = useRef<HTMLElement | null>(null)
  return (
    <>
      <span
        hidden
        ref={(el) => {
          anchor.current = el?.parentElement ?? null
        }}
      />
      <DatePopup
        open
        anchorRef={anchor}
        value={parseDate(value)}
        onSelect={(d) => onSelect(formatDate(d))}
        onClose={() => onClose?.()}
      />
    </>
  )
}
