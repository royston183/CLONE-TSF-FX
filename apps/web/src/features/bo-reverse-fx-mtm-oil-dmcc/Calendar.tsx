import type { RefObject } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'

/** The Key Date calendar: the shared DatePopup, anchored to the Key Date field. */
export function Calendar({
  anchorRef,
  selected,
  onPick,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  selected: Date | null
  onPick: (d: Date) => void
  onClose: () => void
}) {
  return <DatePopup open anchorRef={anchorRef} value={selected} onSelect={onPick} onClose={onClose} title="Key Date" />
}
