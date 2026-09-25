import { useEffect, useRef, useState } from 'react'
import { filterDropdownOptions } from './logic.ts'
import type { DropdownOption } from './types.ts'

/**
 * The original's searchable dropdown (.sdd, buildSearchableDropdown) for Origin Entity and
 * FX Model. It holds free text: the list filters on what is typed, picking an option writes
 * its code, and whether the text is a real code is only decided when View Contracts runs.
 */
export function SearchSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly DropdownOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target || !target.isConnected) return
      if (popRef.current?.contains(target) || target === inputRef.current) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = filterDropdownOptions(options, value)

  return (
    <div className="field sdd">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        className="control"
        id={id}
        type="text"
        placeholder="Select ..."
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
      />
      <div ref={popRef} className={`sdd-pop${open ? ' open' : ''}`} id={id.replace(/Input$/, 'Pop')}>
        {visible.length === 0 ? (
          <div className="sdd-opt sdd-empty">No matches found</div>
        ) : (
          visible.map((o) => (
            <div
              key={o.value}
              className="sdd-opt"
              data-value={o.value}
              onClick={(e) => {
                e.stopPropagation()
                onChange(o.code)
                setOpen(false)
              }}
            >
              <span className="sdd-code">{o.code}</span>
              {o.sub ? <span className="sdd-sub">{o.sub}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
