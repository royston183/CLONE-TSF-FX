import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, isoFromDisplay } from './format.ts'

/** The Fixing Date filter box (DD-MM-YYYY) with the shared pop-up calendar. */
export function CalendarField({ value, onChange }: { value: string; onChange: (dmy: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const onTyped = (raw: string) => {
    let v = raw.replace(/\D/g, '').slice(0, 8)
    if (v.length > 4) v = `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`
    else if (v.length > 2) v = `${v.slice(0, 2)}-${v.slice(2)}`
    onChange(v)
  }

  return (
    <div className="date-wrap toolbar-date" ref={wrapRef}>
      <input
        className="filter-control"
        placeholder="Fixing Date"
        maxLength={10}
        value={value}
        onClick={() => setOpen(true)}
        onChange={(e) => onTyped(e.target.value)}
      />
      <button type="button" className="calbtn" onClick={() => setOpen((o) => !o)}>
        ▣
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={isoFromDisplay(value)}
        title="Fixing Date"
        onSelect={(d) => {
          onChange(fmtDate(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
