import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './DealPickerModal.css'

export type DealPickerRow = { dealId: string; cells: ReadonlyArray<ReactNode>; text: string }

/** The "View Deals" button that opens the picker; sits next to the Deal ID input. */
export function ViewDealsButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="dpm-btn" type="button" onClick={onClick}>
      View Deals
    </button>
  )
}

/**
 * "View Deals": a searchable list of Deal IDs; clicking a row hands its id back to the screen,
 * which loads it exactly as if it had been typed. Self-contained (own overlay and stylesheet).
 * `text` is what the search box matches against.
 */
export function DealPickerModal({
  columns,
  rows,
  emptyText = 'No matching Deal IDs found.',
  hint = 'Click a deal row to load it.',
  onClose,
  onPick,
}: {
  columns: readonly string[]
  rows: readonly DealPickerRow[]
  emptyText?: string
  hint?: string
  onClose: () => void
  onPick: (dealId: string) => void
}) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? rows.filter((r) => r.text.toLowerCase().includes(t)) : rows
  }, [rows, q])

  return (
    <div className="dpm-overlay" role="dialog" aria-modal="true" aria-label="View Deals" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dpm-modal">
        <div className="dpm-head">
          <div className="dpm-title">View Deals</div>
          <button className="dpm-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dpm-body">
          <input ref={inputRef} className="dpm-search" placeholder="Search Deal ID, reference, entity or status..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="dpm-grid">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="dpm-empty">
                      {emptyText}
                    </td>
                  </tr>
                ) : (
                  shown.map((r) => (
                    <tr key={r.dealId} className="dpm-row" onClick={() => onPick(r.dealId)}>
                      {r.cells.map((c, i) => (
                        <td key={i}>{i === 0 ? <strong>{c}</strong> : c}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="dpm-hint">{hint}</div>
        </div>
        <div className="dpm-foot">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
