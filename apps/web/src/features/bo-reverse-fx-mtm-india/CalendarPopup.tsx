import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'

/** The Key Date calendar: the shared DatePopup, anchored to the Key Date field. */
export function CalendarPopup({
  open,
  anchorRef,
  selected,
  onPick,
  onClose,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  selected: Date | null
  onPick: (date: Date) => void
  onClose: () => void
}) {
  return <DatePopup open={open} anchorRef={anchorRef} value={selected} onSelect={onPick} onClose={onClose} title="Key Date" />
}
