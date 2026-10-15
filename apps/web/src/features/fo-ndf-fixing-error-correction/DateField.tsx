import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDate, parseDMY } from './format.ts'

/** The Fixing Date filter: a DD-MM-YYYY text box with the shared calendar popup. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-wrap" id="dateWrap">
      <input className="control date-input" id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} onClick={toggle} placeholder="Fixing Date" />
      <button className="date-btn" type="button" title="Choose fixing date" onClick={(e) => (e.stopPropagation(), toggle())}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" d="M4 6h16v14H4zM8 3v6m8-6v6M4 10h16" />
        </svg>
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title="Fixing Date"
        onSelect={(d) => {
          onChange(formatDate(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
