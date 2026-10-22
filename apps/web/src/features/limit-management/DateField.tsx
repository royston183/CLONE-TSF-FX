import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { dateFromIso, dmyFromIso, isoFromDate } from '../../shared/fx/sap.ts'

/** A DD-MM-YYYY text box with the shared calendar popup; read-only for the additional-limit dialog. */
export function DateField({
  value,
  onChange,
  readOnly = false,
  label,
}: {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  label: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const iso = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value)
  const current = iso ? dateFromIso(`${iso[3]}-${iso[2]}-${iso[1]}`) : null

  return (
    <div ref={wrapRef} className="date-field">
      <input
        className="control"
        placeholder="dd-mm-yyyy"
        maxLength={10}
        autoComplete="off"
        aria-label={label}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => !readOnly && setOpen((o) => !o)}
      />
      <button type="button" className="date-icon" disabled={readOnly} aria-label={`Pick ${label.toLowerCase()}`} onClick={() => setOpen((o) => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={current}
        title={label}
        onSelect={(date) => {
          onChange(dmyFromIso(isoFromDate(date)))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
