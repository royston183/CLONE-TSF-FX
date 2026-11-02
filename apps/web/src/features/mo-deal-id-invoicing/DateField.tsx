import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDMY } from './format.ts'

/** A DD-MM-YYYY text box with the shared pop-up calendar. */
export function DateField({ id, value, onChange, ariaLabel }: { id: string; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-picker">
      <input id={id} type="text" value={value} maxLength={10} inputMode="numeric" aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="calendar-btn" type="button" title="Choose date" aria-label={ariaLabel} onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 3v4M16 3v4M4 9h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <DatePopup
        title={ariaLabel}
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        onSelect={(day) => {
          onChange(formatDate(day))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
