import { useState } from 'react'
import type { Deal, MasterContract } from './types.ts'

/** "Change / Confirm": the legacy #changeModal. Confirm requires every linked txn at status >= 07. */
export function ChangeModal({
  deal,
  masterContracts,
  onClose,
  onConfirm,
}: {
  deal: Deal
  masterContracts: MasterContract[]
  onClose: () => void
  onConfirm: (mcRef: string) => string
}) {
  const [mcRef, setMcRef] = useState(deal.mcRef)
  const [locked, setLocked] = useState(true)
  const [error, setError] = useState('')

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Change / Confirm</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid two">
            <div className="field">
              <label>Deal ID</label>
              <input className="input" readOnly value={deal.id} />
            </div>
            <div className="field">
              <label>Deal Description</label>
              <input className="input" readOnly value={deal.description} />
            </div>
            <div className="field">
              <label>Invoice Plan</label>
              <select className="select" defaultValue="T1-T3">
                <option value="T1-T3">T1 / T2 / T3</option>
                <option value="T1-T2">T1 / T2</option>
              </select>
            </div>
            <div className="field">
              <label>MC Ref No</label>
              <select className="select" disabled={locked} value={mcRef} onChange={(e) => setMcRef(e.target.value)}>
                {masterContracts.map((mc) => (
                  <option key={mc.ref} value={mc.ref}>
                    {mc.ref} — {mc.desc}
                  </option>
                ))}
              </select>
              <div className="validation">{error}</div>
            </div>
          </div>
          <div className="help-note">Confirm is allowed when all linked transactions are at transaction status 07 or higher.</div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="button" onClick={() => setLocked((v) => !v)}>
            {locked ? 'Change' : 'Lock'}
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              const err = onConfirm(mcRef)
              if (err) setError(err)
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
