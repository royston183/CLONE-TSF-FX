import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'

type Props = {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  selected: Date | null
  onClose: () => void
  onPick: (d: Date) => void
}

/** The page's Key Date calendar: the shared DatePopup, anchored to the Key Date field. */
export function CalendarPopup({ anchorRef, open, selected, onClose, onPick }: Props) {
  return <DatePopup open={open} anchorRef={anchorRef} value={selected} onSelect={onPick} onClose={onClose} title="Key Date" />
}
