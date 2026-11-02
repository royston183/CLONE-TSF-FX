import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, parseDate } from './format.ts'

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/**
 * One date box of the Value Date range: a read-only DD.MM.YYYY input, a calendar button and
 * the shared pop-up calendar. The open state is the page's, because only one popup is open at a
 * time. (viewYear / viewMonth / onNav are still passed by the page but the shared popup keeps its
 * own month view, so they are unused here.)
 */
export function DateBox({
  placeholder,
  value,
  open,
  onToggle,
  onPick,
}: {
  placeholder: string
  value: string
  open: boolean
  viewYear?: number
  viewMonth?: number
  onToggle: () => void
  onNav?: (delta: number) => void
  onPick: (value: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  return (
    <div className="dp" ref={wrapRef}>
      <input type="text" value={value} placeholder={placeholder} readOnly onClick={onToggle} />
      <button type="button" className="dp-btn" onClick={onToggle} aria-label="Open calendar">
        <CalendarIcon />
      </button>
      {/* The page closes the calendar on any document click outside `.dp`; the portal is outside it. */}
      <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
        <DatePopup
          open={open}
          anchorRef={wrapRef}
          value={value ? parseDate(value) : null}
          title={placeholder}
          onSelect={(d) => onPick(fmtDate(d))}
          onClose={() => {
            if (open) onToggle()
          }}
        />
      </span>
    </div>
  )
}
