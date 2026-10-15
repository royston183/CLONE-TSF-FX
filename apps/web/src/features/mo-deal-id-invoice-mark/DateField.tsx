import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDate } from './format.ts'

/** A DD-MM-YYYY text box with the shared pop-up calendar. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-wrap">
      <input className="filter-input date-input" id={id} type="text" maxLength={10} value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="calendar-trigger" type="button" aria-label="Choose date" onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 3v4M16 3v4M4 9h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDate(value)}
        onSelect={(day) => {
          onChange(formatDate(day))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
