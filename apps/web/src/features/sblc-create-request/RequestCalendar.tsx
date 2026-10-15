import { useCallback, useEffect, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

export type CalendarMode = 'days' | 'years'

type RequestCalendarProps = {
  rowId: string
  field: string
  /** The button that opened this popup, so the popup can anchor itself next to it. */
  anchorEl: HTMLElement | null
  viewDate: Date
  viewYear: number
  mode: CalendarMode
  selectedText: string
  onPrevMonth: () => void
  onNextMonth: () => void
  onToggleMode: () => void
  onPickYear: (year: number) => void
  onPickMonth: (month: number) => void
  onPickDay: (dateText: string) => void
  onClear: () => void
  onToday: () => void
}

/**
 * The date popup of a request row's date cell, now the shared DatePopup (own month/year view,
 * portal, fixed position). The page's view / mode / navigation props are kept for the callers but
 * unused: the shared popup navigates itself. The popup hides itself on an outside click or Escape
 * and shows again whenever the page re-opens it (it passes a fresh `viewDate` each time).
 */
export function RequestCalendar({ anchorEl, viewDate, selectedText, onPickDay }: RequestCalendarProps) {
  const anchor = useRef<HTMLElement | null>(null)
  anchor.current = anchorEl?.parentElement ?? anchorEl
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [viewDate])
  const close = useCallback(() => setHidden(true), [])

  return (
    <DatePopup
      open={!hidden}
      anchorRef={anchor}
      value={parseDate(selectedText)}
      title="Date"
      onSelect={(d) => onPickDay(formatDate(d))}
      onClose={close}
    />
  )
}
