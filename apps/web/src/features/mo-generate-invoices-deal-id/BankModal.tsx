import { useState } from 'react'
import type { HouseBankAccount } from '../../shared/fx/house-bank.ts'
import type { PartnerBank } from '../../shared/fx/partner-bank.ts'
import type { InvRow } from './types.ts'

/**
 * "Update House Bank / Account ID": the legacy #bankModal (screen 9005). House Bank/Account and
 * Partner Bank are mutually exclusive, as in SAP. House Bank / Account ID are the value helps of MODULE get_house_bank /
 * get_acc_id: the house banks of the SELLER entity's company code (ZSGTSFTR_COMP), and the accounts of the chosen bank, read
 * from HouseBankAccount (ZFS_SB_HBKACCT_O4_API). Partner Bank (get_ptnr_bank: BUT0BK of the FX deal's partner) is read from
 * SlcTsfBpBank (ZFS_SB_SLCTSFBPBANK_O4_API); `reason` carries a load failure, if any.
 */
export function BankModal({
  row,
  reason,
  houseBanks = [],
  company = '',
  partnerBanks = [],
  onClose,
  onUpdate,
}: {
  row: InvRow
  reason: string
  /** HouseBankAccount rows; offered for the seller's company code. */
  houseBanks?: readonly HouseBankAccount[]
  /** The seller entity's company code; blank offers every company's accounts. */
  company?: string
  /** SlcTsfBpBank rows (BUT0BK) of the row's business partner. */
  partnerBanks?: readonly PartnerBank[]
  onClose: () => void
  onUpdate: (houseBank: string, accountId: string, partnerBank: string) => void
}) {
  const [houseBank, setHouseBank] = useState(row.houseBank)
  const [accountId, setAccountId] = useState(row.accountId)
  const [partnerBank, setPartnerBank] = useState(row.partnerBank)

  const partnerDisabled = !!(houseBank || accountId)
  const houseDisabled = !!partnerBank
  const ofCompany = houseBanks.filter((b) => !company || b.companyCode === company)
  const banks = [...new Map(ofCompany.map((b) => [b.houseBank, b.bankName])).entries()]
  const accounts = ofCompany.filter((b) => !houseBank || b.houseBank === houseBank)
  const known = (list: readonly string[], value: string) => !value || list.includes(value)

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
              <select
                className="control"
                disabled={houseDisabled}
                value={houseBank}
                onChange={(e) => {
                  setHouseBank(e.target.value)
                  // The account belongs to a house bank: drop one the new bank does not have.
                  if (!ofCompany.some((b) => b.houseBank === e.target.value && b.accountId === accountId)) setAccountId('')
                }}
              >
                <option value="">Select House Bank...</option>
                {banks.map(([bank, name]) => (
                  <option key={bank} value={bank}>
                    {name ? `${bank} · ${name}` : bank}
                  </option>
                ))}
                {!known(banks.map(([bank]) => bank), houseBank) ? <option value={houseBank}>{houseBank}</option> : null}
              </select>
            </div>
            <div className="field">
              <label>Account ID</label>
              <select className="control" disabled={houseDisabled} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select Account ID...</option>
                {accounts.map((b) => (
                  <option key={`${b.companyCode}|${b.houseBank}|${b.accountId}`} value={b.accountId}>
                    {[b.accountId, b.currency, b.description].filter(Boolean).join(' · ')}
                  </option>
                ))}
                {!known(accounts.map((b) => b.accountId), accountId) ? <option value={accountId}>{accountId}</option> : null}
              </select>
            </div>
            <div className="field span2">
              <label>Partner Bank</label>
              <select className="control" disabled={partnerDisabled} value={partnerBank} onChange={(e) => setPartnerBank(e.target.value)}>
                <option value="">Select Partner Bank...</option>
                {partnerBanks.map((b) => (
                  <option key={b.bankId} value={b.bankId}>
                    {b.bankName ? `${b.bankId} · ${b.bankName}` : b.bankId}
                  </option>
                ))}
                {!known(partnerBanks.map((b) => b.bankId), partnerBank) ? <option value={partnerBank}>{partnerBank}</option> : null}
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
