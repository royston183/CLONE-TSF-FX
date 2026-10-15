import { useCallback, useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, parseDMY } from './format.ts'

/**
 * The page's DD-MM-YYYY date picker (.dp) used on the Value Date range, drawn with the shared
 * DatePopup. Which picker is open is owned by the parent, because opening one closes the other
 * and an outside click or Escape closes both.
 */
export function DatePicker({
  id,
  value,
  open,
  onOpenChange,
  onPick,
}: {
  id: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggle = () => onOpenChange(!open)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <div className="dp" ref={wrapRef}>
      <input id={id} type="text" value={value} readOnly onClick={toggle} />
      <button type="button" className="dp-btn" onClick={toggle} aria-label="Open calendar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {/* The parent closes every picker on a document click outside `.dp`; the popup lives in a
          portal outside it, so its clicks are stopped here (React bubbles portal events to this span). */}
      <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
        <DatePopup
          open={open}
          anchorRef={wrapRef}
          value={parseDMY(value)}
          onSelect={(d) => {
            onPick(fmtDate(d))
            onOpenChange(false)
          }}
          onClose={close}
        />
      </span>
    </div>
  )
}
