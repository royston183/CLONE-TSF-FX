import { useCallback, useRef, useState } from 'react'
import { COMPANIES } from './data.ts'
import { useFloatingPanel } from './floating.ts'
import { companySearchText, getCompany } from './logic.ts'

/**
 * The searchable Company Code dropdown (.dd). It opens on focus or click anywhere in the field
 * and filters on code, name and TSF entity. Typing drops the current selection; leaving the
 * field without picking accepts an exact company code, otherwise clears the text.
 */
export function CompanyDropdown({
  value,
  onSelect,
  onClear,
}: {
  /** The selected company code, '' for none. */
  value: string
  onSelect: (code: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  /** Text being typed; null shows the selection instead. */
  const [typed, setTyped] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const onOutside = useCallback(() => {
    if (!open && value) return
    setOpen(false)
    if (!value) {
      const match = getCompany((typed ?? '').trim().toUpperCase())
      if (match) onSelect(match.code)
      setTyped(null)
    }
  }, [open, value, typed, onSelect])
  useFloatingPanel({
    open,
    wrapRef,
    panelRef,
    options: { matchWidth: true, gap: 4 },
    onOutside,
    onScrollAway: close,
    contentKey: filter,
  })

  const openPanel = (text: string) => {
    setFilter(text)
    setOpen(true)
  }

  const ft = filter.toLowerCase()
  const items = open ? COMPANIES.filter((c) => companySearchText(c).includes(ft)) : []
  const selected = getCompany(value)
  const selectedText = selected ? `${selected.code} - ${selected.name}` : ''
  const text = typed ?? selectedText

  return (
    <div ref={wrapRef} className={`dd${open ? ' open' : ''}`}>
      <input
        id="input-bukrs"
        className="dd-input"
        placeholder="Select ..."
        autoComplete="off"
        value={text}
        title={typed === null ? selectedText : ''}
        onFocus={() => openPanel('')}
        onClick={() => openPanel('')}
        onChange={(e) => {
          setTyped(e.target.value)
          onClear()
          openPanel(e.target.value)
        }}
      />
      <div ref={panelRef} className="dd-panel">
        {items.length === 0 ? (
          <div className="dd-empty">No matches found</div>
        ) : (
          items.map((c) => (
            <div
              key={c.code}
              className="dd-item"
              role="option"
              aria-selected={c.code === value}
              onClick={() => {
                setTyped(null)
                setOpen(false)
                onSelect(c.code)
              }}
            >
              <span className="primary-line">{`${c.code} · ${c.name}`}</span>
              <span className="secondary-line">{`TSF Entity ${c.entity}`}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
