import { useCallback, useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, safeParseDate } from './format.ts'

/**
 * The page's DD-MM-YYYY date picker (.dp), drawn with the shared DatePopup; the day clicked is
 * written back in dd-mm-yyyy. Which picker is open is owned by the parent, because opening one
 * closes the other and an outside click closes both.
 */
export function DatePicker({
  id,
  label,
  value,
  open,
  onOpenChange,
  onPick,
}: {
  id: string
  label: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <div className="dp" ref={wrapRef}>
      <input
        id={id}
        aria-label={label}
        type="text"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        value={value}
        aria-invalid={value.trim() !== '' && !safeParseDate(value)}
        onChange={(e) => {
          onPick(e.target.value)
          onOpenChange(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onOpenChange(true)
          } else if (e.key === 'Escape' || e.key === 'Enter') {
            onOpenChange(false)
          }
        }}
      />
      <button type="button" className="dp-btn" onClick={() => onOpenChange(!open)} aria-label="Open calendar">
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
          value={safeParseDate(value)}
          title={label}
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
