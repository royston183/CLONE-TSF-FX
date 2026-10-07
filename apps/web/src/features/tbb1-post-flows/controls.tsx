import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MONTHS, WEEKDAYS } from './data.ts'
import { formatDMY, parseDMY } from './logic.ts'
import type { Option } from './types.ts'

/** The page's positionFloating: under the trigger (or above when it does not fit), inside the viewport. */
function placeFloating(trigger: HTMLElement, panel: HTMLElement, opts: { width?: number; alignRight?: boolean } = {}) {
  const margin = 8
  const gap = 4
  const tr = trigger.getBoundingClientRect()
  if (opts.width) panel.style.width = `${opts.width}px`
  const pr = panel.getBoundingClientRect()
  let left = opts.alignRight ? tr.right - pr.width : tr.left
  left = Math.max(margin, Math.min(left, window.innerWidth - pr.width - margin))
  let top = tr.bottom + gap
  if (top + pr.height > window.innerHeight - margin) {
    const above = tr.top - gap - pr.height
    top = above >= margin ? above : Math.max(margin, window.innerHeight - pr.height - margin)
  }
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

/** Closes when the user clicks elsewhere or the page scrolls (the panel is fixed to the viewport). */
function useDismiss(open: boolean, host: React.RefObject<HTMLElement | null>, panel: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (host.current && !host.current.contains(e.target as Node)) close()
    }
    const onScroll = (e: Event) => {
      if (panel.current && !panel.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, host, panel, close])
}

/**
 * SELECT-OPTIONS … NO INTERVALS as the page's multi-select. `items` is the value help; `free` lets the
 * user add a typed value, for fields SAP serves no list for (counterparty, portfolio, securities, currency).
 */
export function MultiSelect({ value, items, onChange, free = false, upper = true }: { value: string[]; items: readonly Option[]; onChange: (v: string[]) => void; free?: boolean; upper?: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const close = () => setOpen(false)
  useDismiss(open, host, panel, close)
  useLayoutEffect(() => {
    if (open && trigger.current && panel.current) placeFloating(trigger.current, panel.current, { width: Math.max(trigger.current.offsetWidth, 280) })
  }, [open, search, value])

  const ft = search.trim().toLowerCase()
  const shown = items.filter((it) => !ft || it.t.toLowerCase().includes(ft))
  const typed = upper ? search.trim().toUpperCase() : search.trim()
  const canAdd = free && typed !== '' && !value.includes(typed) && !items.some((it) => it.v === typed)
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const openPanel = () => {
    setSearch('')
    setOpen(true)
    setTimeout(() => input.current?.focus(), 0)
  }
  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      openPanel()
    }
  }
  const extra = value.filter((v) => !items.some((it) => it.v === v))

  return (
    <div className={`ms${open ? ' open' : ''}`} ref={host}>
      <div className="control ms-trigger" tabIndex={0} role="button" aria-haspopup="listbox" ref={trigger} onClick={() => (open ? close() : openPanel())} onKeyDown={onTriggerKey}>
        <span className="ms-value">{!value.length ? <span className="ms-ph">Select ...</span> : value.length <= 2 ? value.join(', ') : `${value.length} selected`}</span>
        <span className="ms-caret">{'▼'}</span>
      </div>
      <div className="ms-panel" ref={panel}>
        <input
          className="control ms-search"
          placeholder={free ? 'Search or type a value ...' : 'Search ...'}
          autoComplete="off"
          ref={input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter' && canAdd) {
              onChange([...value, typed])
              setSearch('')
            }
          }}
        />
        <div className="ms-list">
          {canAdd ? (
            <div className="ms-item" onClick={() => { onChange([...value, typed]); setSearch('') }}>
              <input type="checkbox" tabIndex={-1} readOnly checked={false} />
              <span>Add &quot;{typed}&quot;</span>
            </div>
          ) : null}
          {extra.map((v) => (
            <div className="ms-item" key={`x-${v}`} onClick={() => toggle(v)}>
              <input type="checkbox" tabIndex={-1} readOnly checked />
              <span>{v}</span>
            </div>
          ))}
          {shown.map((it) => (
            <div className="ms-item" key={it.v} onClick={() => toggle(it.v)}>
              <input type="checkbox" tabIndex={-1} readOnly checked={value.includes(it.v)} />
              <span>{it.t}</span>
            </div>
          ))}
          {!shown.length && !extra.length && !canAdd ? <div className="ms-empty">{free ? 'Type a value and press Enter' : 'No matches found'}</div> : null}
        </div>
        <div className="ms-foot">
          <span className="ms-count">{value.length ? `${value.length} selected` : ''}</span>
          <button type="button" className="ms-clear" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

/** A DD-MM-YYYY field with the page's calendar; the view month is set only when the calendar opens. */
export function DateField({ value, onChange, onBlur }: { value: string; onChange: (dmy: string) => void; onBlur?: () => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const wrap = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useDismiss(open, wrap, popup, close)
  useLayoutEffect(() => {
    if (open && wrap.current && popup.current) placeFloating(wrap.current, popup.current, { alignRight: true })
  }, [open, view])

  const toggle = () => {
    if (open) return close()
    const sel = parseDMY(value) ?? new Date()
    setView(new Date(sel.getFullYear(), sel.getMonth(), 1))
    setOpen(true)
  }
  const y = view.getFullYear()
  const m = view.getMonth()
  const selected = parseDMY(value)
  const first = new Date(y, m, 1).getDay()
  const dim = new Date(y, m + 1, 0).getDate()
  const prevDim = new Date(y, m, 0).getDate()
  const today = new Date().toDateString()
  const years: number[] = []
  for (let yy = y - 10; yy <= y + 10; yy++) years.push(yy)
  const trailing = (7 - ((first + dim) % 7)) % 7

  return (
    <div className="date-field" ref={wrap}>
      <input className="control" placeholder="DD-MM-YYYY" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onClick={() => !open && toggle()} />
      <button type="button" className="date-icon" aria-label="Open calendar" onClick={toggle}>
        &#128197;
      </button>
      <div className={`date-popup${open ? ' open' : ''}`} ref={popup}>
        <div className="cal-head">
          <button type="button" aria-label="Previous month" onClick={() => setView(new Date(y, m - 1, 1))}>
            {'‹'}
          </button>
          <div className="cal-sels">
            <select data-role="month" value={m} onChange={(e) => setView(new Date(y, Number(e.target.value), 1))}>
              {MONTHS.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select data-role="year" value={y} onChange={(e) => setView(new Date(Number(e.target.value), m, 1))}>
              {years.map((yy) => (
                <option key={yy} value={yy}>
                  {yy}
                </option>
              ))}
            </select>
          </div>
          <button type="button" aria-label="Next month" onClick={() => setView(new Date(y, m + 1, 1))}>
            {'›'}
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((d) => (
            <div className="dow" key={d}>
              {d}
            </div>
          ))}
          {Array.from({ length: first }, (_, i) => (
            <div className="day muted" key={`p${i}`}>
              {prevDim - first + 1 + i}
            </div>
          ))}
          {Array.from({ length: dim }, (_, i) => {
            const d = new Date(y, m, i + 1)
            const cls = ['day', selected && d.toDateString() === selected.toDateString() ? 'selected' : '', d.toDateString() === today ? 'today' : ''].filter(Boolean).join(' ')
            return (
              <div
                className={cls}
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onChange(formatDMY(d))
                  close()
                }}
              >
                {i + 1}
              </div>
            )
          })}
          {Array.from({ length: trailing }, (_, i) => (
            <div className="day muted" key={`n${i}`}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
