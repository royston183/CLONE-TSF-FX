import { useEffect, useState } from 'react'
import { fmtNum } from '@slc/api-client'

export type BlSplitModalProps = {
  open: boolean
  blId: string
  /** The next split id this BL is up to — "02" for its first split, "03" for the next, ... */
  nextSplitId: string
  totalQty: number
  onCancel: () => void
  onConfirm: (splitQty: number) => void
}

/**
 * BL Data 1's "BL Split" popup. Splits the selected BL line item into the entered quantity and
 * whatever quantity is left over, which become two line items once confirmed (see
 * BlDetailsPanel's applySplit). Only offered while the BL carries no Deal ID yet — SPLIT
 * DETAILS is read-only besides Qty for BL Split, which the user types.
 */
export function BlSplitModal({ open, blId, nextSplitId, totalQty, onCancel, onConfirm }: BlSplitModalProps) {
  const [splitQtyText, setSplitQtyText] = useState('')
  const [error, setError] = useState('')

  // Re-populate from scratch every time the popup opens, so a previous attempt's leftover text
  // or error never carries over onto the next BL this is opened for.
  useEffect(() => {
    if (!open) return
    setSplitQtyText('')
    setError('')
  }, [open])

  if (!open) return null

  const splitQty = Number(splitQtyText)
  const hasSplitQty = splitQtyText.trim() !== '' && Number.isFinite(splitQty)
  const balanceQty = hasSplitQty ? totalQty - splitQty : totalQty

  function handleConfirm() {
    if (!hasSplitQty || splitQty <= 0) {
      setError('Enter a valid quantity to split.')
      return
    }
    if (splitQty >= totalQty) {
      setError('Qty for BL Split must be less than Total Qty.')
      return
    }
    setError('')
    onConfirm(splitQty)
  }

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal-dialog narrow" role="dialog" aria-modal="true" aria-labelledby="blSplitModalTitle">
        <div className="modal-head">
          <div className="modal-title" id="blSplitModalTitle">
            BL Split ID
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="section-box">
            <div className="section-head">Split Details</div>
            <div className="section-body field-grid grid2">
              <div className="field">
                <label htmlFor="bsBlId">BL ID</label>
                <input type="text" id="bsBlId" readOnly value={blId} />
              </div>
              <div className="field">
                <label htmlFor="bsBlSplitId">BL Split ID</label>
                <input type="text" id="bsBlSplitId" readOnly value={nextSplitId} />
              </div>
              <div className="field">
                <label htmlFor="bsTotalQty">Total Qty</label>
                <input type="text" id="bsTotalQty" className="amt-input" readOnly value={fmtNum(totalQty, 3)} />
              </div>
              <div className="field">
                <label htmlFor="bsSplitQty">
                  Qty for BL Split<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="bsSplitQty"
                  className="amt-input"
                  inputMode="decimal"
                  placeholder="e.g. 100"
                  value={splitQtyText}
                  onChange={(event) => {
                    setSplitQtyText(event.target.value)
                    setError('')
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="bsBalanceQty">Balance Quantity</label>
                <input type="text" id="bsBalanceQty" className="amt-input" readOnly value={fmtNum(balanceQty, 3)} />
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <span className="field-hint">{error}</span>
          <div className="modal-actions">
            <button type="button" className="hdr-btn primary" onClick={handleConfirm}>
              Confirm
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
