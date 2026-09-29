import { useMemo, useRef, useState, useEffect } from 'react'
import { dealPickerText } from './logic.ts'
import { dealStatusLabel } from './format.ts'
import type { Deal } from './types.ts'

/** "View Deals": the legacy #dealPickerModal, a searchable list of all Deal IDs. */
export function DealPickerModal({ deals, onClose, onPick }: { deals: Record<string, Deal>; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = Object.values(deals).filter((d) => !needle || dealPickerText(d).indexOf(needle) >= 0)
    all.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    return all
  }, [deals, q])

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <div className="modal-title">View Deals</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="deal-picker-tools">
            <input
              ref={inputRef}
              className="deal-picker-search"
              placeholder="Search Deal ID, reference, MC, model, entity, trader, status..."
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="deal-picker-count">
              {rows.length} {rows.length === 1 ? 'deal' : 'deals'}
            </span>
          </div>
          <div className="deal-picker-table-wrap">
            <table className="deal-picker-table">
              <thead>
                <tr>
                  <th>Deal ID</th>
                  <th>Deal Reference / Description</th>
                  <th>Status</th>
                  <th>MC Ref No</th>
                  <th>FX Model</th>
                  <th>Entity String</th>
                  <th>Trader</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#6d8295', padding: '28px' }}>
                      No matching Deal IDs.
                    </td>
                  </tr>
                ) : (
                  rows.map((d) => (
                    <tr key={d.id} onClick={() => onPick(d.id)}>
                      <td className="deal-picker-id">{d.id}</td>
                      <td>{d.description || d.ref}</td>
                      <td>{dealStatusLabel(d.status)}</td>
                      <td>{d.mcRef}</td>
                      <td>{d.fxModel}</td>
                      <td>{d.entityString}</td>
                      <td>{d.traderCode ? `${d.traderCode} — ${d.trader}` : d.trader}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
