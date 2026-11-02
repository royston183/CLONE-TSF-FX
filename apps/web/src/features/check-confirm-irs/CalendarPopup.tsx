import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

export type CalendarPopupProps = {
  open: boolean
  /** The date field (input + button) the calendar hangs from. */
  anchorRef: RefObject<HTMLElement | null>
  /** The current Key Date text (DD-MM-YYYY), so the matching day can be highlighted. */
  value: string
  onPickDate(date: string): void
  onClose(): void
}

/** The Key Date calendar: the shared DatePopup; picked days are handed back as DD-MM-YYYY text. */
export function CalendarPopup({ open, anchorRef, value, onPickDate, onClose }: CalendarPopupProps) {
  return (
    <DatePopup
      open={open}
      anchorRef={anchorRef}
      value={parseDate(value)}
      onSelect={(date) => onPickDate(formatDate(date))}
      onClose={onClose}
      title="Key Date"
    />
  )
}
