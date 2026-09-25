import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useFloatingPanel } from './floating.ts'

/**
 * The original's searchable dropdown (.dd): a text box that filters a floating list.
 * Typing drops the current selection, and leaving the field without picking clears the text.
 */
export function SearchDropdown<T>({
  items,
  selected,
  keyOf,
  searchText,
  primaryText,
  displayText,
  placeholder,
  onSelect,
  onClear,
}: {
  items: readonly T[]
  selected: T | undefined
  keyOf: (item: T) => string
  searchText: (item: T) => string
  primaryText: (item: T) => ReactNode
  displayText: (item: T) => string
  placeholder: string
  onSelect: (item: T) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  /** Text being typed; null shows the selection instead. */
  const [typed, setTyped] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const onOutside = useCallback(() => {
    setOpen(false)
    setTyped(null)
  }, [])
  useFloatingPanel({ open, wrapRef, panelRef, options: { matchWidth: true, gap: 4 }, onOutside, contentKey: filter })

  const openPanel = (text: string) => {
    setFilter(text)
    setOpen(true)
  }

  const ft = filter.toLowerCase()
  const visible = open ? items.filter((it) => searchText(it).toLowerCase().includes(ft)) : []
  const text = typed ?? (selected ? displayText(selected) : '')

  return (
    <div ref={wrapRef} className={`dd${open ? ' open' : ''}`}>
      <input
        className="dd-input"
        placeholder={placeholder}
        autoComplete="off"
        value={text}
        title={selected && typed === null ? displayText(selected) : ''}
        onFocus={() => openPanel('')}
        onClick={() => openPanel('')}
        onChange={(e) => {
          setTyped(e.target.value)
          openPanel(e.target.value)
          onClear()
        }}
      />
      <div ref={panelRef} className="dd-panel">
        {visible.length === 0 ? (
          <div className="dd-empty">No matches found</div>
        ) : (
          visible.map((it) => (
            <div
              key={keyOf(it)}
              className="dd-item"
              onClick={() => {
                setTyped(null)
                setOpen(false)
                onSelect(it)
              }}
            >
              <span className="primary-line">{primaryText(it)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
