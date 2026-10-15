import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import './date-popup.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WIDTH = 288
const GAP = 6
const EDGE = 12

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const label = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

export type DatePopupProps = {
  open: boolean
  /** The input (or its wrapper) the popup hangs from; clicks on it never count as "outside". */
  anchorRef: RefObject<HTMLElement | null>
  /** The date currently chosen, if any: highlighted, and the month the calendar opens on. */
  value: Date | null
  onSelect: (date: Date) => void
  onClose: () => void
  /** Days outside this range are shown but cannot be picked. */
  min?: Date | undefined
  max?: Date | undefined
  /** Accessible name of the dialog, e.g. "Key Date". */
  title?: string
}

/**
 * The one calendar popup for every date field. It is drawn in a portal on document.body with
 * position:fixed and a z-index above every dialog, so no table, card or scroll container can clip
 * it or paint over it. It flips above the field when there is no room below, follows the field
 * while the page scrolls, and closes on an outside click or Escape (Escape is taken before the
 * dialog the field lives in, so it closes the calendar and not the dialog).
 */
export function DatePopup({ open, anchorRef, value, onSelect, onClose, min, max, title = 'Date' }: DatePopupProps) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState(() => new Date())
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  // Each opening re-centres on the chosen date (or today).
  useEffect(() => {
    if (!open) return
    const base = value && Number.isFinite(value.getTime()) ? value : new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    // Keyboard users arriving from the calendar button land in the popup; someone typing in the
    // field (a field that opens on focus) keeps their cursor where it is.
    const active = document.activeElement
    if (active instanceof HTMLInputElement && anchorRef.current?.contains(active)) return
    box.current?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (box.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
      anchorRef.current?.querySelector<HTMLElement>('input')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, anchorRef, onClose])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const height = box.current?.offsetHeight || 320
      const below = anchor.bottom + GAP
      const top = below + height <= window.innerHeight - EDGE ? below : Math.max(EDGE, anchor.top - height - GAP)
      const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - WIDTH - EDGE))
      setPos((p) => (p.top === top && p.left === left ? p : { top, left }))
    }
    place()
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node) || !box.current?.contains(e.target)) place()
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, anchorRef, view])

  if (!open) return null

  const year = view.getFullYear()
  const month = view.getMonth()
  const today = new Date()
  const lead = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((lead + days) / 7) * 7
  const years = Array.from({ length: Math.max(year, today.getFullYear() + 100) - Math.min(1900, year) + 1 }, (_, i) => Math.min(1900, year) + i)
  const lo = min ? startOfDay(min) : null
  const hi = max ? startOfDay(max) : null

  return createPortal(
    <div ref={box} id={id} className="sdp" style={{ top: pos.top, left: pos.left, width: WIDTH }} role="dialog" aria-label={`${title} calendar`}>
      <div className="sdp-head">
        <button type="button" className="sdp-nav" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))}>
          &#8249;
        </button>
        <select className="sdp-select" data-no-search aria-label="Month" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select className="sdp-select sdp-year" data-no-search aria-label="Year" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className="sdp-nav" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))}>
          &#8250;
        </button>
      </div>
      <div className="sdp-grid">
        {DAYS.map((d) => (
          <span key={d} className="sdp-dow">
            {d}
          </span>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const date = new Date(year, month, i - lead + 1)
          const outside = date.getMonth() !== month
          const off = (lo !== null && date < lo) || (hi !== null && date > hi)
          const chosen = value !== null && Number.isFinite(value.getTime()) && sameDay(date, value)
          const cls = `sdp-day${outside ? ' out' : ''}${chosen ? ' on' : ''}${sameDay(date, today) ? ' today' : ''}`
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={off}
              aria-label={label(date)}
              aria-pressed={chosen}
              aria-current={sameDay(date, today) ? 'date' : undefined}
              onClick={() => onSelect(date)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
