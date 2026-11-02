import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, parseUiDate } from './format.ts'
import { CommitInput } from './inputs.tsx'

/** Typed dates retain the existing commit/validation path; calendar picks use that same path. */
export function DateField({ id, label, value, onCommit, className = '', active = true }: {
  id?: string
  label: string
  value: string
  onCommit: (value: string) => void
  className?: string
  active?: boolean
}) {
  const field = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = parseUiDate(value)

  const close = useCallback(() => setOpen(false), [])
  const pick = (date: Date) => {
    onCommit(fmtDate(date))
    setOpen(false)
    field.current?.querySelector('input')?.focus()
  }

  useEffect(() => { if (!active) setOpen(false) }, [active])

  return <div className="fx-date-field" ref={field}>
    <CommitInput id={id} className={className} value={value} onCommit={onCommit} aria-label={label} placeholder="DD-MM-YYYY"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) }
      }} />
    <button className="fx-date-trigger" type="button" aria-label={`Choose ${label}`} aria-expanded={open && active}
      onClick={() => setOpen(o => !o)}><CalendarDays size={15} aria-hidden="true" /></button>
    <DatePopup open={open && active} anchorRef={field} value={selected && Number.isFinite(selected.getTime()) ? selected : null} title={label} onSelect={pick} onClose={close} />
  </div>
}
