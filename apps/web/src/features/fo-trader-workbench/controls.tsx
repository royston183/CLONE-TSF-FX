import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFloatingPanel } from './floating.ts'
import { formatDMY, parseDMY } from './format.ts'

/**
 * The original's createDropdown: a text box that opens a filterable list on focus or click.
 * Typing filters; leaving without picking restores the selection's text. An optional
 * `emptyLabel` row clears the value ("All models").
 */
export function Dropdown<T>({
  items,
  value,
  placeholder = 'Select ...',
  emptyLabel,
  valueOf,
  primary,
  secondary,
  display,
  search,
  disabled = false,
  onChange,
}: {
  items: readonly T[]
  value: string
  placeholder?: string
  emptyLabel?: string
  valueOf: (item: T) => string
  primary: (item: T) => ReactNode
  secondary?: (item: T) => ReactNode
  display: (item: T) => string
  search: (item: T) => string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  /** The text being typed while the list is open; null shows the selection. */
  const [typed, setTyped] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setTyped(null)
  }, [])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { matchWidth: true, gap: 4 },
    onOutside: close,
    onScrollAway: close,
    closeOnResize: true,
    contentKey: typed,
  })

  const current = items.find((it) => valueOf(it) === value)
  const shownText = current ? display(current) : ''
  const filter = (typed ?? '').toLowerCase()
  const visible = items.filter((it) => !filter || search(it).toLowerCase().includes(filter))
  const showEmpty = !!emptyLabel && filter === ''

  const choose = (v: string) => {
    setOpen(false)
    setTyped(null)
    onChange(v)
  }
  const openList = (text: string | null) => {
    if (disabled) return
    setTyped(text)
    setOpen(true)
  }

  return (
    <div ref={wrapRef} className={`dd${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}>
      <input
        ref={inputRef}
        className="dd-input"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={typed ?? shownText}
        title={shownText}
        onFocus={(e) => {
          e.target.select()
          openList(null)
        }}
        onClick={() => {
          if (!open) openList(null)
        }}
        onChange={(e) => openList(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (showEmpty) choose('')
            else if (visible[0]) choose(valueOf(visible[0]))
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            close()
            inputRef.current?.blur()
          }
        }}
      />
      <div ref={panelRef} className="dd-panel">
        {showEmpty ? (
          <div
            className={`dd-item${value === '' ? ' active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              choose('')
            }}
          >
            <span className="primary-line" style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
              {emptyLabel}
            </span>
          </div>
        ) : null}
        {visible.map((it) => (
          <div
            key={valueOf(it)}
            className={`dd-item${valueOf(it) === value ? ' active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              choose(valueOf(it))
            }}
          >
            <span className="primary-line">{primary(it)}</span>
            {secondary ? <span className="secondary-line">{secondary(it)}</span> : null}
          </div>
        ))}
        {!showEmpty && visible.length === 0 ? <div className="dd-empty">No matches found</div> : null}
      </div>
    </div>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * The original's createDateField: a dd-mm-yyyy box that inserts the dashes as you type, with
 * a month calendar (month and year pickers) that opens on the shown date. A value is
 * committed on a pick, on blur, or once ten characters are typed; only then is it checked.
 */
export function DateField({ value, onCommit }: { value: string; onCommit: (value: string, ok: boolean) => void }) {
  const [text, setTextState] = useState(value)
  const [bad, setBad] = useState(false)
  /** The latest text, for the delayed blur commit (a calendar pick may land in between). */
  const textRef = useRef(value)
  const setText = (v: string) => {
    textRef.current = v
    setTextState(v)
  }
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // A reset from outside (Reset, Refresh) replaces what was typed; an echo of our own commit does not.
  useEffect(() => {
    if (value === textRef.current.trim()) return
    textRef.current = value
    setTextState(value)
    setBad(false)
  }, [value])

  const close = useCallback(() => setOpen(false), [])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { alignRight: true, gap: 6 },
    onOutside: close,
    onScrollAway: close,
    contentKey: `${view.getFullYear()}-${view.getMonth()}`,
  })

  const commit = (v: string) => {
    const t = v.trim()
    const ok = t === '' || !!parseDMY(t)
    setBad(!ok)
    onCommit(t, ok)
  }
  const openCal = () => {
    const sel = parseDMY(text)
    setView(sel ? new Date(sel.getFullYear(), sel.getMonth(), 1) : new Date())
    setOpen(true)
  }

  const selected = parseDMY(text)
  const year = view.getFullYear()
  const month = view.getMonth()
  const off = new Date(year, month, 1).getDay()
  const dim = new Date(year, month + 1, 0).getDate()
  const dprev = new Date(year, month, 0).getDate()
  const trailing = (7 - ((off + dim) % 7)) % 7
  const today = new Date().toDateString()
  const years = Array.from({ length: 17 }, (_, i) => year - 8 + i)

  return (
    <div ref={wrapRef} className={`date-field${bad ? ' bad-date' : ''}`}>
      <input
        className="control"
        placeholder="dd-mm-yyyy"
        maxLength={10}
        autoComplete="off"
        value={text}
        onClick={() => {
          if (!open) openCal()
        }}
        onChange={(e) => {
          let v = e.target.value.replace(/[^0-9-]/g, '')
          const native = e.nativeEvent as InputEvent
          if (native.inputType?.startsWith('insert') && (v.length === 2 || v.length === 5)) v += '-'
          setText(v)
          if (v.length === 10) commit(v)
        }}
        onBlur={() => setTimeout(() => commit(textRef.current), 120)}
      />
      <button type="button" className="date-icon" aria-label="Open calendar" onClick={() => (open ? close() : openCal())}>
        📅
      </button>
      <div ref={panelRef} className={`date-popup${open ? ' open' : ''}`}>
        {open ? (
          <>
            <div className="cal-head">
              <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}>
                ‹
              </button>
              <span className="cal-title">
                <select className="cal-sel" value={month} onChange={(e) => setView(new Date(year, Number(e.target.value), 1))}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>{' '}
                <select className="cal-sel" value={year} onChange={(e) => setView(new Date(Number(e.target.value), month, 1))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
              <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <div key={d} className="dow">
                  {d}
                </div>
              ))}
              {Array.from({ length: off }, (_, i) => (
                <div key={`p${i}`} className="day muted">
                  {dprev - off + 1 + i}
                </div>
              ))}
              {Array.from({ length: dim }, (_, i) => {
                const day = i + 1
                const dt = new Date(year, month, day)
                let cls = 'day'
                if (selected && dt.getTime() === new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime())
                  cls += ' selected'
                if (dt.toDateString() === today) cls += ' today'
                return (
                  <div
                    key={day}
                    className={cls}
                    onClick={() => {
                      const v = formatDMY(dt)
                      setText(v)
                      setOpen(false)
                      commit(v)
                    }}
                  >
                    {day}
                  </div>
                )
              })}
              {Array.from({ length: trailing }, (_, i) => (
                <div key={`n${i}`} className="day muted">
                  {i + 1}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
