import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

export type CalendarPopupProps = {
  id: string
  value: string
  onSelect: (value: string) => void
  onClose: () => void
}

/**
 * The date picker the legacy page reused for Key Date, the termination date and every DMS
 * doc date: now the shared DatePopup. It is mounted only while open, inside the field's shell
 * (input + calendar button), which it uses as its anchor.
 */
export function CalendarPopup({ id, value, onSelect, onClose }: CalendarPopupProps) {
  const anchor = useRef<HTMLElement | null>(null)
  return (
    <>
      <span id={id} style={{ display: 'none' }} ref={(el) => void (anchor.current = el?.parentElement ?? null)} />
      <DatePopup
        open
        anchorRef={anchor}
        value={parseDate(value)}
        title="Date"
        onSelect={(d) => {
          onSelect(formatDate(d))
          onClose()
        }}
        onClose={onClose}
      />
    </>
  )
}
