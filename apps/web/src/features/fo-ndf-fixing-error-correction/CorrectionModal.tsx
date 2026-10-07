import { useEffect, useRef, useState } from 'react'
import { oldRateText, rate } from './format.ts'
import { settlementDisplay } from './logic.ts'
import type { NdfRow } from './types.ts'

/** "NDF Rate Correction": the legacy #ndfOverlay, opened on the selected pending fixing. */
export function CorrectionModal({ row, onClose, onUpdate }: { row: NdfRow; onClose: () => void; onUpdate: (newRate: number) => void }) {
  const [newRate, setNewRate] = useState(() => rate(row.oldRate))
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 20)
    return () => window.clearTimeout(t)
  }, [])

  const submit = () => {
    const parsed = parseFloat(newRate)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid new fixing rate greater than zero.')
      inputRef.current?.focus()
      return
    }
    onUpdate(parsed)
  }

  return (
    <div className="overlay open" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">NDF Rate Correction</div>
          <button className="close-btn" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="section-box">
            <div className="section-label">NDF Details</div>
            <div className="form-row">
              <div className="field">
                <label>Fixing Date</label>
                <input className="field-control readonly" type="text" readOnly value={row.fixDate} />
              </div>
              <div className="field wide">
                <label>Fixing Ref</label>
                <input className="field-control readonly" type="text" readOnly value={`${row.fixRef} — ${row.fixRefName}`} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Old Fixing Rate</label>
                <input className="field-control readonly num" type="text" readOnly value={oldRateText(row.oldRate)} />
              </div>
              <div className="field">
                <label>New Fixing Rate</label>
                <input
                  ref={inputRef}
                  className="field-control num"
                  type="text"
                  inputMode="decimal"
                  value={newRate}
                  onChange={(e) => {
                    setError('')
                    setNewRate(e.target.value)
                  }}
                />
                <div className="field-error">{error}</div>
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="field wide">
                <label>Settlement Amt</label>
                <input className="field-control readonly num" type="text" readOnly value={settlementDisplay(row, newRate)} />
              </div>
              <div className="field">
                <label>Currency</label>
                <input className="field-control readonly" type="text" readOnly value={row.settleCurr} />
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" type="button" onClick={submit}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
