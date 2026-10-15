import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

export type CalendarProps = {
  open: boolean
  /** The date field (input + button) the calendar hangs from. */
  anchorRef: RefObject<HTMLElement | null>
  /** The Key Date field's text, DD-MM-YYYY, or '' when empty. */
  value: string
  /** Called with the picked date (DD-MM-YYYY). The parent closes the popup. */
  onPick: (value: string) => void
  onClose: () => void
}

/** The Key Date calendar: the shared DatePopup. */
export function Calendar({ open, anchorRef, value, onPick, onClose }: CalendarProps) {
  return (
    <DatePopup
      open={open}
      anchorRef={anchorRef}
      value={parseDate(value)}
      onSelect={(date) => onPick(formatDate(date))}
      onClose={onClose}
      title="Key Date"
    />
  )
}
