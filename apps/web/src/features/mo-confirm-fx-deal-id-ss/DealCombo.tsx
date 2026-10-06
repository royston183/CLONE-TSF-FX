import { useEffect, useRef, useState } from 'react'
import { searchDeals } from './logic.ts'
import type { DealDb } from './types.ts'

/**
 * The Deal ID combo box: typing or focusing searches (an empty box lists every deal), a click
 * outside closes the list, and picking a row writes its id into the box and loads it.
 */
export function DealCombo({
  db,
  value,
  onChange,
  onPick,
  emptyText = 'No matching Deal ID',
}: {
  db: DealDb
  value: string
  onChange: (v: string) => void
  onPick: (dealId: string) => void
  /** Shown when nothing matches, e.g. why ZSGTSFTR_DEALID could not be read. */
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const search = (t: string) => {
    setTerm(t)
    setOpen(true)
  }

  // The original searched on every input and focus; the list only shows while open, so
  // deriving it from the last searched term is the same thing.
  const results = searchDeals(db, term)

  return (
    <div className="combo" ref={rootRef}>
      <span className="combo-icon">🔍</span>
      <input
        type="text"
        placeholder="Search Deal ID, reference or trader…"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          search(e.target.value)
        }}
        onFocus={(e) => search(e.target.value)}
      />
      <div className={`combo-list${open ? ' open' : ''}`}>
        {results.length === 0 ? (
          <div className="combo-empty">{emptyText}</div>
        ) : (
          results.map((d) => {
            return (
              <div
                key={d.dealId}
                className="combo-item"
                onClick={() => {
                  onChange(d.dealId)
                  setOpen(false)
                  onPick(d.dealId)
                }}
              >
                <div className="ci-top">
                  <span>
                    {d.dealId} — {d.dealRef}
                  </span>
                  <span className="text-faint">{d.statusText}</span>
                </div>
                <div className="ci-bottom">
                  {d.fxModel} · {d.fxModelDesc} · MC {d.mcRefNo}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
