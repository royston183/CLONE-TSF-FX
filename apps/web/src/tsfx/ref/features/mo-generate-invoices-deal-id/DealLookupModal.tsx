import { DataTable as UniversalTable } from '@tsfx/components/table/DataTable';
import { useMemo, useRef, useState, useEffect } from 'react'
import { dealLookupText, searchRows } from './logic.ts'
import type { DealListRow } from './types.ts'

/** "View Deals": the legacy #dealLookupModal, a searchable list of the Deal IDs (ZSGTSFTR_DEALID). */
export function DealLookupModal({ deals, reason, onClose, onPick }: { deals: DealListRow[]; reason: string; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const rows = useMemo(() => searchRows(deals.map((d) => ({ ...d, __text: dealLookupText(d) })), q, ['__text']), [deals, q])

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal md">
        <div className="modal-head">
          <div className="modal-title">View Deals</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input ref={inputRef} className="search" style={{ width: '100%' }} placeholder="Search Deal ID, reference, model, entity or status..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mini-grid" style={{ maxHeight: 430 }}>
            <UniversalTable>
              <thead>
                <tr>
                  <th>Deal ID</th>
                  <th>Deal Reference</th>
                  <th>FX Model</th>
                  <th>Entity String</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      {reason ? `Deal IDs (ZSGTSFTR_DEALID) unavailable: ${reason}` : 'No matching Deal IDs found.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((d) => (
                    <tr key={d.dealId} className="deal-lookup-row" onClick={() => onPick(d.dealId)}>
                      <td>
                        <strong>{d.dealId}</strong>
                      </td>
                      <td>{d.dealRef}</td>
                      <td>{d.modelId}</td>
                      <td>{d.entityString}</td>
                      <td>{d.statusLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </UniversalTable>
          </div>
          <div className="hint">Click a deal row to load it into the Invoice Finalisation Blotter.</div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
