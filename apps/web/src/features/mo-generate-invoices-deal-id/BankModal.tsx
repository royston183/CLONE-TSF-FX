import { useState } from 'react'
import type { InvRow } from './types.ts'

const HOUSE_BANKS = ['H001 - Standard Chartered', 'H002 - DBS Bank', 'H003 - HSBC Singapore']
const ACCOUNT_IDS = ['USD01', 'USD02', 'EUR01']
const PARTNER_BANKS = [
  { value: '0001', label: '0001 - Standard Chartered Bank Singapore' },
  { value: '0002', label: '0002 - DBS Bank Ltd' },
  { value: '0003', label: '0003 - HSBC Singapore' },
]

function houseBankLabel(code: string): string {
  if (code === 'H001') return 'H001 - Standard Chartered'
  if (code === 'H002') return 'H002 - DBS Bank'
  if (code === 'H003') return 'H003 - HSBC Singapore'
  return ''
}

/** "Update House Bank / Account ID": the legacy #bankModal. House Bank/Account and Partner Bank are mutually exclusive, as in SAP. */
export function BankModal({ row, onClose, onUpdate }: { row: InvRow; onClose: () => void; onUpdate: (houseBank: string, accountId: string, partnerBank: string) => void }) {
  const [houseBank, setHouseBank] = useState(houseBankLabel(row.houseBank))
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
                {HOUSE_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Account ID</label>
              <select className="control" disabled={houseDisabled} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select Account ID...</option>
                {ACCOUNT_IDS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="field span2">
              <label>Partner Bank</label>
              <select className="control" disabled={partnerDisabled} value={partnerBank} onChange={(e) => setPartnerBank(e.target.value)}>
                <option value="">Select Partner Bank...</option>
                {PARTNER_BANKS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="hint">As in SAP, entering House Bank/Account ID disables Partner Bank; entering Partner Bank disables House Bank/Account ID.</div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-btn primary" type="button" onClick={() => onUpdate(houseBank ? houseBank.substring(0, 4) : '', accountId, partnerBank)}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
