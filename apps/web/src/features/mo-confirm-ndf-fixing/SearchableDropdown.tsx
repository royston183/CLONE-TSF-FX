import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { filterDropdownItems } from './logic.ts'
import type { DropdownItem } from './types.ts'

/**
 * The page's searchable dropdown: a text box whose .dropdown-panel opens on focus and on
 * typing, lists the items matching what is typed, and closes when an item is picked or on a
 * click anywhere outside the box and panel.
 */
export function SearchableDropdown({
  inputId,
  panelId,
  inputClassName = 'input',
  placeholder,
  wrapStyle,
  value,
  items,
  invalid = false,
  onType,
  onBlur,
  onSelect,
}: {
  inputId: string
  panelId: string
  inputClassName?: string
  placeholder: string
  wrapStyle?: CSSProperties
  value: string
  items: DropdownItem[]
  invalid?: boolean
  onType: (raw: string) => void
  onBlur?: () => void
  onSelect: (item: DropdownItem) => void
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!panelRef.current?.contains(t) && t !== inputRef.current) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const shown = filterDropdownItems(items, value)

  return (
    <div className="dropdown-wrap" style={wrapStyle}>
      <input
        ref={inputRef}
        type="text"
        id={inputId}
        className={`${inputClassName}${invalid ? ' error' : ''}`}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onType(e.target.value)
          setOpen(true)
        }}
        onBlur={onBlur}
      />
      <div id={panelId} ref={panelRef} className={`dropdown-panel${open ? '' : ' hidden'}`}>
        {shown.length === 0 ? (
          <div className="dropdown-empty">No matches found</div>
        ) : (
          shown.map((item) => (
            <div
              key={item.primary}
              className="dropdown-item"
              onClick={() => {
                onSelect(item)
                setOpen(false)
              }}
            >
              <span className="primary">{item.primary}</span>
              {item.secondary ? <span className="secondary">{item.secondary}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
