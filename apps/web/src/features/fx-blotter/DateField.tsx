import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { fmtDate, parseUiDate } from './format.ts'
import { CommitInput } from './inputs.tsx'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Typed dates retain the existing commit/validation path; calendar picks use that same path. */
export function DateField({ id, label, value, onCommit, className = '', active = true }: {
  id?: string
  label: string
  value: string
  onCommit: (value: string) => void
  className?: string
  active?: boolean
}) {
  const generatedId = useId()
  const calendarId = `${generatedId}-calendar`
  const field = useRef<HTMLDivElement>(null)
  const calendar = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const [position, setPosition] = useState({ top: 0, left: 0, width: 288 })
  const selected = parseUiDate(value)
  const year = view.getFullYear(), month = view.getMonth()
  const today = new Date()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstYear = Math.min(1900, year), lastYear = Math.max(today.getFullYear() + 100, year)

  const show = () => {
    const date = selected && Number.isFinite(selected.getTime()) ? selected : new Date()
    setView(new Date(date.getFullYear(), date.getMonth(), 1))
    setOpen(true)
  }
  const close = () => { setOpen(false); field.current?.querySelector('input')?.focus() }
  const pick = (day: number) => { onCommit(fmtDate(new Date(year, month, day))); close() }

  useEffect(() => { if (!active) setOpen(false) }, [active])
  useEffect(() => { if (open && active) calendar.current?.querySelector('select')?.focus() }, [open, active])
  useEffect(() => {
    if (!open || !active) return
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !field.current?.contains(e.target) && !calendar.current?.contains(e.target)) setOpen(false)
    }
    // Capture Escape before the owning dialog closes itself.
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) }
  }, [open, active])

  useLayoutEffect(() => {
    if (!open || !active) return
    const place = () => {
      const box = field.current?.getBoundingClientRect()
      if (!box) return
      const width = Math.min(288, window.innerWidth - 24)
      const height = calendar.current?.offsetHeight || 304
      const top = box.bottom + height + 6 <= window.innerHeight - 12 ? box.bottom + 6 : Math.max(12, box.top - height - 6)
      setPosition({ top, left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)), width })
    }
    place()
    const scroll = (e: Event) => { if (!(e.target instanceof Node) || !calendar.current?.contains(e.target)) place() }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true) }
  }, [open, active, year, month])

  return <div className="fx-date-field" ref={field}>
    <CommitInput id={id} className={className} value={value} onCommit={onCommit} aria-label={label} placeholder="DD-MM-YYYY"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); show() }
      }} />
    <button className="fx-date-trigger" type="button" aria-label={`Choose ${label}`} aria-expanded={open && active} aria-controls={open && active ? calendarId : undefined}
      onClick={() => open ? close() : show()}><CalendarDays size={15} aria-hidden="true" /></button>
    {open && active ? createPortal(
      <div ref={calendar} id={calendarId} className="fx-date-calendar" style={position} role="dialog" aria-label={`${label} calendar`}>
        <div className="fx-date-calendar__heading">
          <button type="button" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button>
          <select data-no-search aria-label="Month" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
            {MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <select data-no-search aria-label="Year" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
            {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => <option key={firstYear + i} value={firstYear + i}>{firstYear + i}</option>)}
          </select>
          <button type="button" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button>
        </div>
        <div className="fx-date-calendar__grid">
          {DAYS.map(day => <span className="fx-date-calendar__weekday" key={day}>{day}</span>)}
          {Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const chosen = selected?.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
            return <button type="button" key={day} aria-label={fmtDate(new Date(year, month, day))} aria-pressed={chosen} aria-current={isToday ? 'date' : undefined} onClick={() => pick(day)}>{day}</button>
          })}
        </div>
      </div>, document.body,
    ) : null}
  </div>
}
