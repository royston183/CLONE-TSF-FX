import { useEffect, useRef, useState } from 'react'
import { filterOptions, toggleId } from './logic.ts'
import type { MselOption } from './types.ts'

function Chevron({ right }: { right?: boolean }) {
  return (
    <svg className="chev" viewBox="0 0 10 6" fill="none" style={right ? { right: 8 } : undefined}>
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/**
 * The original's searchable multiselect (Region / Origin Entity / FX Model). Which one is
 * open is owned by the screen, so opening one closes the others, as the original did.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  open,
  onOpenChange,
}: {
  options: readonly MselOption[]
  selected: readonly string[]
  onChange: (next: string[]) => void
  placeholder: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [term, setTerm] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target || !target.isConnected) return
      if (wrapRef.current && !wrapRef.current.contains(target)) onOpenChange(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open, onOpenChange])

  const shown = filterOptions(options, term)

  return (
    <div ref={wrapRef} className="msel">
      <button
        type="button"
        className={`msel-btn${open ? ' open' : ''}`}
        onClick={() => {
          if (open) onOpenChange(false)
          else {
            setTerm('')
            onOpenChange(true)
          }
        }}
      >
        {selected.length === 0 ? (
          <>
            <span className="msel-btn-label placeholder">{placeholder}</span>
            <Chevron />
          </>
        ) : (
          <>
            <span className="msel-btn-label">{selected.join(', ')}</span>
            <span className="msel-count">{selected.length}</span>
            <Chevron right />
          </>
        )}
      </button>
      <div className={`msel-panel${open ? ' show' : ''}`}>
        <input
          ref={searchRef}
          type="text"
          className="msel-search"
          placeholder="Search..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="msel-list">
          {shown.length === 0 ? (
            <div className="msel-empty">No matches</div>
          ) : (
            shown.map((o) => (
              <label
                key={o.id}
                className="msel-opt"
                onClick={(e) => {
                  e.preventDefault()
                  onChange(toggleId(selected, o.id))
                }}
              >
                <input type="checkbox" checked={selected.includes(o.id)} readOnly />
                <span>
                  {o.id} – {o.label}
                </span>
                {o.sub ? <span className="msel-opt-sub">{o.sub}</span> : null}
              </label>
            ))
          )}
        </div>
        <div className="msel-foot">
          <button type="button" onClick={() => onChange([])}>
            Clear
          </button>
          <button type="button" onClick={() => onOpenChange(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
