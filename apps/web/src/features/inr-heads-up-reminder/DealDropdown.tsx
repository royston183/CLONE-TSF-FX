import { useCallback, useRef, useState } from 'react'
import { useFloatingPanel } from './floating.ts'
import { dealOptions } from './logic.ts'
import type { Deal } from './types.ts'

/**
 * The searchable Deal ID dropdown (#dd-dealId). It opens on focus or click anywhere in the
 * field and filters on "<deal id> <description>". Typing drops the current selection; leaving
 * the field without picking clears the text; Escape closes it and leaves the field.
 */
export function DealDropdown({
  deals,
  value,
  onChange,
}: {
  deals: readonly Deal[]
  /** The selected Deal ID, or '' for none. */
  value: string
  onChange: (dealId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  /** The text being typed; null shows the selection instead. */
  const [typed, setTyped] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const onOutside = useCallback(() => {
    setOpen(false)
    // Leaving without a pick clears whatever text was typed.
    if (!value) setTyped(null)
  }, [value])
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

  const text = typed ?? value
  const items = open ? dealOptions(deals, filter) : []

  return (
    <div className="tb-field">
      <div ref={wrapRef} className={`dd${open ? ' open' : ''}`} id="dd-dealId">
        <input
          ref={inputRef}
          className="dd-input"
          id="input-dealId"
          placeholder="Deal ID"
          autoComplete="off"
          aria-label="Deal ID"
          value={text}
          onFocus={() => openPanel('')}
          onClick={() => openPanel(text && value ? '' : text)}
          onChange={(e) => {
            setTyped(e.target.value)
            if (value) onChange('')
            openPanel(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
        />
        <div ref={panelRef} className="dd-panel" id="panel-dealId">
          {items.length === 0 ? (
            <div className="dd-empty">No matches found</div>
          ) : (
            items.map((d) => (
              <div
                key={d.dealId}
                className="dd-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTyped(null)
                  setOpen(false)
                  onChange(d.dealId)
                }}
              >
                <span className="primary-line">{d.dealId}</span>
                <span className="secondary-line">{d.dealDesc}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
