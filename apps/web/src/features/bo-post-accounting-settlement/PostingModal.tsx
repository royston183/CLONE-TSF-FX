import { fmtAmt, fmtMoney } from './format.ts'
import { isInvPosted, type PostingAction } from './logic.ts'
import { ModalShell, SECONDARY_BTN, StaticField } from './modal.tsx'
import type { InvLeg } from './types.ts'

const DASH = '–'

/** Modal 9002: Posting Pop-up (invoice leg). */
export function PostingModal({
  open,
  leg,
  seq,
  onClose,
  onAction,
}: {
  open: boolean
  leg: InvLeg | null
  /** 1-based position of the leg in the grid. */
  seq: number
  onClose: () => void
  onAction: (action: PostingAction) => void
}) {
  const posted = leg ? isInvPosted(leg) : false
  return (
    <ModalShell
      open={open}
      size="wide"
      className="invoice-posting-modal"
      icon={'📄'}
      title={leg ? leg.tradeType : 'Invoice Posting'}
      subtitle={leg ? leg.setDesc : 'Trade invoice accounting entry'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" style={SECONDARY_BTN} onClick={() => onAction('UPD_DATA')}>
            Update
          </button>
          <button type="button" className="btn-confirm is-green" onClick={() => onAction('SET_EXE')}>
            Settlement Complete
          </button>
          <button type="button" className="btn-confirm" disabled={posted} onClick={() => onAction('SET_POST')}>
            {posted ? 'Already Posted' : 'Post Document'}
          </button>
        </>
      }
    >
      {leg && (
        <>
          <div className="posting-section">
            <div className="section-label">Basic Details</div>
            <div className="field-grid cols3">
              <StaticField label="Sequence">{seq}</StaticField>
              <StaticField label="Trade Type">{leg.tType}</StaticField>
              <StaticField label="Linked FX Deal">{leg.dMap || `${DASH} external leg ${DASH}`}</StaticField>
              <StaticField label="Invoice Amount">{fmtMoney(leg.invCurr, leg.invAmt)}</StaticField>
              <StaticField label="Payment Amount">{fmtMoney(leg.payCurr, leg.payAmt)}</StaticField>
              <StaticField label="Premium Amount">{leg.preAmt ? fmtAmt(leg.preAmt) : DASH}</StaticField>
              <StaticField label="FI Document No">{leg.fiDoc || `${DASH} not posted ${DASH}`}</StaticField>
              <StaticField label="Transfer Type">{leg.trfType}</StaticField>
              <div className="field">
                <label>Settlement Complete</label>
                <div className="static posting-settlement">
                  <input className="chk" type="checkbox" aria-label="Settlement complete" checked={leg.setCheck} disabled readOnly />
                  <span>{leg.setCheck ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="posting-section">
            <div className="section-label">Sender / Receiver Details</div>
            <div className="field-grid cols3">
              <StaticField label="Sender / Payer">{leg.buy}</StaticField>
              <StaticField label="Sender House Bank">{leg.senderHouseBank || DASH}</StaticField>
              <StaticField label="Sender Account ID">{leg.senderAccountId || DASH}</StaticField>
              <StaticField label="Receiver / Payee">{leg.sell}</StaticField>
              <StaticField label="Receiver House Bank">{leg.receiverHouseBank || DASH}</StaticField>
              <StaticField label="Receiver Account ID">{leg.receiverAccountId || DASH}</StaticField>
              {leg.partnerBank ? (
                <div className="posting-partner-bank">
                  <StaticField label="Partner Bank (Generate Invoices)">
                    {leg.businessPartner ? `${leg.partnerBank} · BP ${leg.businessPartner}` : leg.partnerBank}
                  </StaticField>
                </div>
              ) : null}
            </div>
          </div>
          <div className="posting-section">
            <div className="section-label">Accounting Entry</div>
            <p className="doc-link-pending">The debit / credit lines are the leg's posting keys and accounts stored on MO: Execute Settlement for Deal ID.</p>
          </div>
        </>
      )}
    </ModalShell>
  )
}
