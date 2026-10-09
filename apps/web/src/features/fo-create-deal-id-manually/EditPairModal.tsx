import { useState } from 'react'
import { getCompatibleTxns } from './logic.ts'
import type { FxRow, PoolTxn } from './types.ts'

/** "Edit Deal Pair": the legacy #editModal, reached by dropping the selected FX row onto Edit Deal Pair. */
export function EditPairModal({
  row,
  pool,
  onClose,
  onUpdate,
}: {
  row: FxRow
  pool: PoolTxn[]
  onClose: () => void
  onUpdate: (newRfha: string) => void
}) {
  const compatible = getCompatibleTxns(row, pool)
  const [newTxn, setNewTxn] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const submit = () => {
    if (!newTxn) {
      setError('Select a new transaction.')
      return
    }
    onUpdate(newTxn)
  }

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Edit Deal Pair</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid two">
            <div className="field">
              <label>Deal Type</label>
              <input className="input" readOnly value={row.dealType} />
            </div>
            <div className="field">
              <label>Company Code</label>
              <input className="input" readOnly value={row.bukrs} />
            </div>
            <div className="field">
              <label>Old Transaction</label>
              <input className="input" readOnly value={row.rfha} />
            </div>
            <div className="field">
              <label>New Transaction<span className="req">*</span></label>
              <select
                className="select"
                disabled={!editing}
                value={newTxn}
                onChange={(e) => {
                  setError('')
                  setNewTxn(e.target.value)
                }}
              >
                <option value="">Select transaction</option>
                {compatible.length ? (
                  compatible.map((t) => (
                    <option key={t.rfha} value={t.rfha}>
                      {t.rfha} — {t.side1} {t.curr1} / {t.side2} {t.curr2}
                    </option>
                  ))
                ) : (
                  <option value="DEMO_REPLACEMENT">DEMO_REPLACEMENT — compatible demo transaction</option>
                )}
              </select>
              <div className="validation">{error}</div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Lock' : 'Edit'}
          </button>
          <button className="btn primary" type="button" disabled={!editing} onClick={submit}>
            Deal Update
          </button>
        </div>
      </div>
    </div>
  )
}
