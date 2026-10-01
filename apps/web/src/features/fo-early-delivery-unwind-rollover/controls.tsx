import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { formatDateDMY, isoOf, todayIsoUtc } from './format.ts'
import type { Avail, DdOption } from './types.ts'

/** Closes a popup on any click outside `wrap` (the legacy page's shared document listener). */
function useOutsideClose(open: boolean, wrapRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      // A click that re-rendered its own target has detached it by now; it happened inside.
      if (!target || !target.isConnected) return
      if (wrapRef.current && !wrapRef.current.contains(target)) close()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open, wrapRef, close])
}

/**
 * The original's DD component: a read-only box that toggles a list of options. The label
 * reads "primary — secondary".
 */
export function Dropdown({
  options,
  value,
  placeholder,
  onChange,
}: {
  options: readonly DdOption[]
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(open, wrapRef, close)

  const match = options.find((o) => o.value === value)
  const label = match ? match.primary + (match.secondary ? ` — ${match.secondary}` : '') : ''

  return (
    <div ref={wrapRef} className={`dd${open ? ' open' : ''}`}>
      <input
        className="dd-input"
        placeholder={placeholder}
        readOnly
        autoComplete="off"
        value={label}
        onClick={() => setOpen((o) => !o)}
      />
      <input type="hidden" value={value} readOnly />
      <div className="dd-panel">
        {options.length === 0 ? (
          <div className="dd-empty">No options</div>
        ) : (
          options.map((o) => (
            <div
              key={o.value}
              className={`dd-item${o.value === value ? ' active' : ''}`}
              data-val={o.value}
              onClick={() => {
                setOpen(false)
                onChange(o.value)
              }}
            >
              <span className="primary-line">{o.primary}</span>
              {o.secondary ? <span className="secondary-line">{o.secondary}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * A Dropdown whose options are read from SAP. Until they are, it offers nothing and says why:
 * a value help is never filled with made-up entries.
 */
export function SapDropdown({
  avail,
  value,
  placeholder,
  onChange,
}: {
  avail: Avail<readonly DdOption[]>
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const options = avail.state === 'ok' ? avail.value : []
  const shown =
    avail.state === 'ok' ? placeholder : avail.state === 'loading' ? 'Loading…' : avail.state === 'waiting' ? 'WAITING FOR API' : 'Unavailable'
  return (
    <>
      <Dropdown options={options} value={value} placeholder={shown} onChange={onChange} />
      {avail.state === 'waiting' || avail.state === 'error' ? (
        <div className="hint" title={avail.reason}>
          {avail.state === 'waiting' ? 'WAITING FOR API: ' : ''}
          {avail.reason}
        </div>
      ) : null}
    </>
  )
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function initialView(value: string | null): { y: number; m: number } {
  const d = value ? new Date(`${value}T00:00:00`) : new Date()
  return { y: d.getFullYear(), m: d.getMonth() }
}

/**
 * The original's DF component: a read-only dd-mm-yyyy box plus a month calendar. Values are
 * ISO. The calendar opens on the month of the value it was mounted with (the legacy
 * `DF.setValue` did the same each time a modal opened), and remembers where it was browsed to.
 */
export function DateField({
  value,
  onChange,
  min = null,
}: {
  value: string | null
  onChange: (iso: string) => void
  min?: string | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => initialView(value))
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(open, wrapRef, close)

  const { y, m } = view
  const firstDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrev = new Date(y, m, 0).getDate()
  const todayIso = todayIsoUtc()
  const toggle = () => setOpen((o) => !o)

  return (
    <div ref={wrapRef} className="date-field">
      <input className="control" placeholder="dd-mm-yyyy" readOnly autoComplete="off" value={formatDateDMY(value)} onClick={toggle} />
      <button type="button" className="date-icon" onClick={toggle}>
        📅
      </button>
      <div className={`date-popup${open ? ' open' : ''}`}>
        <div className="cal-head">
          <button type="button" onClick={() => setView(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>
            ‹
          </button>
          <span className="cal-title">
            {MONTHS[m]} {y}
          </span>
          <button type="button" onClick={() => setView(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {Array.from({ length: firstDow }, (_, k) => (
            <div key={`p${k}`} className="day muted" style={{ cursor: 'default' }}>
              {daysInPrev - (firstDow - 1 - k)}
            </div>
          ))}
          {Array.from({ length: daysInMonth }, (_, k) => {
            const day = k + 1
            const iso = isoOf(y, m, day)
            const disabled = !!min && iso < min
            const cls = `day${value === iso ? ' selected' : ''}${iso === todayIso ? ' today' : ''}`
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                disabled={disabled}
                data-iso={iso}
                onClick={() => {
                  setOpen(false)
                  onChange(iso)
                }}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
