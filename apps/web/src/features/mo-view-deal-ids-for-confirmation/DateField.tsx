import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, parseDMY } from './format.ts'

/**
 * The Key Date box: DD-MM-YYYY text with the shared pop-up calendar.
 * The typed value is committed on blur, a picked day at once.
 */
export function DateField({
  value,
  onChange,
  onCommit,
}: {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-field">
      <input
        className="control"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          // Moving into the calendar popup is not leaving the field; picking a day commits it.
          const to = e.relatedTarget
          if (to instanceof Element && to.closest('.sdp')) return
          onCommit(e.target.value)
        }}
        onClick={toggle}
      />
      <button type="button" className="date-icon" aria-label="Open calendar" onClick={toggle}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title="Key Date"
        onSelect={(d) => {
          const picked = fmtDate(d)
          onChange(picked)
          setOpen(false)
          onCommit(picked)
        }}
        onClose={close}
      />
    </div>
  )
}
