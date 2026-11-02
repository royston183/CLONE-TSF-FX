import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { dateToIso, parseDisplayDate, toDisplayDate } from './format.ts'

/** The Key Date field: a DD-MM-YYYY text box with the shared pop-up calendar. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-wrap" id="dateWrap">
      <input className="control date-input" id={id} type="text" placeholder="Key Date" maxLength={10} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} />
      <button className="calendar-trigger" type="button" title="Choose key date" onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDisplayDate(value)}
        onSelect={(day) => {
          onChange(toDisplayDate(dateToIso(day)))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
