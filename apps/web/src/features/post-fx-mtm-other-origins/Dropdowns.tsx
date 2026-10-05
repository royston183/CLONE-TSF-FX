import { useState, type KeyboardEvent } from 'react'
import { companyDisplay } from './logic.ts'
import type { SelectItem } from './types.ts'

function matches(it: SelectItem, q: string): boolean {
  return !q || `${it.label} ${it.secondary ?? ''}`.toLowerCase().includes(q.toLowerCase())
}

/**
 * The original's single-value dropdown (.dd): read-only unless searchable, with arrow keys and Enter
 * to pick, Escape to close. Whether it is open is owned by the page, so that only one panel is
 * ever open at a time. An empty value shows an empty box (the "All" / default entry).
 */
export function Dropdown({
  id,
  items,
  value,
  searchable = false,
  open,
  onOpenChange,
  onChange,
}: {
  id: string
  items: readonly SelectItem[]
  value: string
  searchable?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}) {
  /** Text being typed into a searchable box; null shows the selection instead. */
  const [typed, setTyped] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(-1)

  const labelFor = (v: string) => (v === '' ? '' : (items.find((it) => it.value === v)?.label ?? ''))
  const query = open && searchable ? (typed ?? '') : ''
  const list = items.filter((it) => matches(it, query))
  const text = open && typed !== null ? typed : labelFor(value)

  const openPanel = () => {
    setTyped(null)
    setActiveIdx(-1)
    onOpenChange(true)
  }
  const select = (v: string) => {
    setTyped(null)
    onOpenChange(false)
    onChange(v)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openPanel()
      setActiveIdx(e.key === 'ArrowDown' ? Math.min(list.length - 1, activeIdx + 1) : Math.max(0, activeIdx - 1))
    } else if (e.key === 'Enter') {
      const hit = list[activeIdx]
      if (open && hit) {
        e.preventDefault()
        select(hit.value)
      } else if (!open) openPanel()
    } else if (e.key === 'Escape') onOpenChange(false)
  }

  return (
    <div className={`dd${open ? ' open' : ''}`} id={`dd-${id}`}>
      <input
        className="dd-input"
        id={`input-${id}`}
        placeholder="Select ..."
        autoComplete="off"
        readOnly={!searchable}
        value={text}
        onClick={() => {
          if (open) {
            if (!searchable) onOpenChange(false)
          } else openPanel()
        }}
        onFocus={() => {
          if (searchable && !open) openPanel()
        }}
        onChange={(e) => {
          if (!searchable) return
          setTyped(e.target.value)
          setActiveIdx(-1)
          onOpenChange(true)
        }}
        onKeyDown={onKeyDown}
      />
      <div className="dd-panel" id={`panel-${id}`} onMouseDown={(e) => e.preventDefault()}>
        {list.length === 0 ? (
          <div className="dd-empty">No matches</div>
        ) : (
          list.map((it, i) => (
            <div
              key={it.value}
              className={`dd-item${i === activeIdx ? ' active' : ''}`}
              data-v={it.value}
              onClick={() => select(it.value)}
            >
              <span className="primary-line">{it.label}</span>
              {it.secondary ? <span className="secondary-line">{it.secondary}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** The Company Code multi-select: checkboxes with Select all / Clear, shown as "All (n)" or the codes. */
export function MultiSelect({
  id,
  items,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  id: string
  items: readonly SelectItem[]
  value: readonly string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string[]) => void
}) {
  return (
    <div className={`dd${open ? ' open' : ''}`} id={`ms-${id}`}>
      <input
        className="dd-input"
        id={`input-${id}`}
        readOnly
        placeholder="Select ..."
        autoComplete="off"
        value={companyDisplay(value, items.length)}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            onOpenChange(true)
          } else if (e.key === 'Escape') onOpenChange(false)
        }}
      />
      <div className="dd-panel" id={`panel-${id}`}>
        <div className="ms-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onChange(items.map((i) => i.value))}>
            Select all
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
        {items.map((it) => (
          <label key={it.value} className="ms-item">
            <input
              type="checkbox"
              value={it.value}
              checked={value.includes(it.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value.filter((v) => v !== it.value), it.value].sort() : value.filter((v) => v !== it.value),
                )
              }
            />
            <span>
              <span className="ms-main">{it.value}</span>
              <br />
              <span className="ms-sub">{it.label}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
