import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDMY, parseDMY } from './format.ts'
import type { CalendarView } from './logic.ts'

type Props = {
  /** DD-MM-YYYY. */
  value: string
  /** Kept for the page; the shared popup opens on the value or today. */
  initialView?: CalendarView
  open: boolean
  onToggle: () => void
  onPick: (dmy: string) => void
  label: string
}

/** The page's dd-mm-yyyy date picker: a read-only input, an icon button and the shared calendar popup. */
export function DatePicker({ value, open, onToggle, onPick, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className="dp" ref={wrapRef}>
      <input type="text" readOnly value={value} aria-label={label} onClick={onToggle} />
      <button type="button" className="dp-btn" onClick={onToggle} aria-label="Open calendar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {/* The page closes the calendar on any document click outside `.dp`; the portal is outside it. */}
      <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
        <DatePopup
          open={open}
          anchorRef={wrapRef}
          value={value ? parseDMY(value) : null}
          title={label}
          onSelect={(d) => onPick(fmtDMY(d))}
          onClose={() => {
            if (open) onToggle()
          }}
        />
      </span>
    </div>
  )
}
