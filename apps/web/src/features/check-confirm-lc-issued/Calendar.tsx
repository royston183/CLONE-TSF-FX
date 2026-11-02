import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate } from './format.ts'

export type CalendarProps = {
  open: boolean
  /** The date field (input + button) the calendar hangs from. */
  anchorRef: RefObject<HTMLElement | null>
  selected: Date | null
  /** The picked day as DD-MM-YYYY text. */
  onPickDate: (text: string) => void
  onClose: () => void
}

/** The Key Date calendar: the shared DatePopup. */
export function Calendar({ open, anchorRef, selected, onPickDate, onClose }: CalendarProps) {
  return (
    <DatePopup
      open={open}
      anchorRef={anchorRef}
      value={selected}
      onSelect={(date) => onPickDate(formatDate(date))}
      onClose={onClose}
      title="Key Date"
    />
  )
}
