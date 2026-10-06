import { useState } from 'react'
import type { InvRow } from './types.ts'

/**
 * "Update House Bank / Account ID": the legacy #bankModal (screen 9005). House Bank/Account and
 * Partner Bank are mutually exclusive, as in SAP. The value helps (MODULE get_house_bank /
 * get_acc_id / get_ptnr_bank) read T012 / T012K / T012T and BUT0BK, which no service exposes, so
 * the lists hold only the row's current values and `reason` says why.
 */
export function BankModal({ row, reason, onClose, onUpdate }: { row: InvRow; reason: string; onClose: () => void; onUpdate: (houseBank: string, accountId: string, partnerBank: string) => void }) {
  const [houseBank, setHouseBank] = useState(row.houseBank)
  const [accountId, setAccountId] = useState(row.accountId)
  const [partnerBank, setPartnerBank] = useState(row.partnerBank)

  const partnerDisabled = !!(houseBank || accountId)
  const houseDisabled = !!partnerBank

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal md">
        <div className="modal-head">
          <div className="modal-title">Update House Bank / Account ID</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-form">
            <div className="field">
              <label>Trade Type</label>
              <input className="control readonly" readOnly value={row.ttype} />
            </div>
            <div className="field">
              <label>Inv Type</label>
              <input className="control readonly" readOnly value={row.invType} />
            </div>
            <div className="field">
              <label>Seller</label>
              <input className="control readonly" readOnly value={row.seller} />
            </div>
            <div className="field">
              <label>Buyer</label>
              <input className="control readonly" readOnly value={row.buyer} />
            </div>
            <div className="field">
              <label>House Bank</label>
              <select className="control" disabled={houseDisabled} value={houseBank} onChange={(e) => setHouseBank(e.target.value)}>
                <option value="">Select House Bank...</option>
                {row.houseBank ? <option value={row.houseBank}>{row.houseBank}</option> : null}
              </select>
            </div>
            <div className="field">
              <label>Account ID</label>
              <select className="control" disabled={houseDisabled} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select Account ID...</option>
                {row.accountId ? <option value={row.accountId}>{row.accountId}</option> : null}
              </select>
            </div>
            <div className="field span2">
              <label>Partner Bank</label>
              <select className="control" disabled={partnerDisabled} value={partnerBank} onChange={(e) => setPartnerBank(e.target.value)}>
                <option value="">Select Partner Bank...</option>
                {row.partnerBank ? <option value={row.partnerBank}>{row.partnerBank}</option> : null}
              </select>
            </div>
          </div>
          <div className="hint">{reason || 'As in SAP, entering House Bank/Account ID disables Partner Bank; entering Partner Bank disables House Bank/Account ID.'}</div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-btn primary" type="button" onClick={() => onUpdate(houseBank, accountId, partnerBank)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
