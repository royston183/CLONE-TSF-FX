import { fmtAmt, fmtMoney } from './format.ts'
import { invoiceEntry, isInvPosted, type PostingAction } from './logic.ts'
import { EntryTable, ModalShell, SECONDARY_BTN, StaticField } from './modal.tsx'
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
      size=""
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
          <div className="section-label">Basic Details</div>
          <div className="field-grid cols3">
            <StaticField label="Sequence">{seq}</StaticField>
            <StaticField label="Trade Type">{leg.tType}</StaticField>
            <StaticField label="Linked FX Deal">{leg.dMap || `${DASH} external leg ${DASH}`}</StaticField>
          </div>
          <div className="section-label">Amounts</div>
          <div className="field-grid cols3">
            <StaticField label="Invoice Amount">{fmtMoney(leg.invCurr, leg.invAmt)}</StaticField>
            <StaticField label="Payment Amount">{fmtMoney(leg.payCurr, leg.payAmt)}</StaticField>
            <StaticField label="Premium Amount">{leg.preAmt ? fmtAmt(leg.preAmt) : DASH}</StaticField>
          </div>
          <div className="section-label">Sender / Receiver</div>
          <div className="field-grid">
            <StaticField label="Sender / Payer">{leg.buy}</StaticField>
            <StaticField label="Receiver / Payee">{leg.sell}</StaticField>
            <StaticField label="Sender House Bank">{leg.senderHouseBank || 'DBS03'}</StaticField>
            <StaticField label="Sender Account ID">{leg.senderAccountId || 'DBS00'}</StaticField>
            <StaticField label="Receiver House Bank">{leg.receiverHouseBank || 'JPM01'}</StaticField>
            <StaticField label="Receiver Account ID">{leg.receiverAccountId || 'JPM02'}</StaticField>
          </div>
          <div className="check-row">
            <input className="chk" type="checkbox" checked={leg.setCheck} disabled readOnly /> Settlement complete
          </div>
          <div className="section-label">Accounting Entry</div>
          <EntryTable lines={invoiceEntry(leg)} />
          <div className="field-grid" style={{ marginTop: 10 }}>
            <StaticField label="FI Document No">{leg.fiDoc || `${DASH} not posted ${DASH}`}</StaticField>
            <StaticField label="Transfer Type">{leg.trfType}</StaticField>
          </div>
        </>
      )}
    </ModalShell>
  )
}
