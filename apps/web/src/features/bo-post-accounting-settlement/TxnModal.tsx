import { fmtMoney, fmtRate } from './format.ts'
import { buyEntry, isFxPosted, sellEntry, type TxnAction } from './logic.ts'
import { EntryTable, ModalShell, SECONDARY_BTN, StaticField } from './modal.tsx'
import type { FxLeg } from './types.ts'

const NOT_POSTED = '– not posted –'

/** Modal 9003: Transactions Posting (FX leg). */
export function TxnModal({
  open,
  leg,
  onClose,
  onAction,
}: {
  open: boolean
  leg: FxLeg | null
  onClose: () => void
  onAction: (action: TxnAction) => void
}) {
  const posted = leg ? isFxPosted(leg) : false
  return (
    <ModalShell
      open={open}
      size="wide"
      icon={'⇄'}
      title="Transaction Settlement"
      subtitle={leg ? `Deal Type ${leg.dealType} · Transaction ${leg.rfha} · ${leg.entity}` : 'FX deal accounting entries'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" style={SECONDARY_BTN} onClick={() => onAction('TEST')}>
            Test Run
          </button>
          <button type="button" className="btn-confirm" style={SECONDARY_BTN} onClick={() => onAction('UPD')}>
            Update
          </button>
          <button type="button" className="btn-confirm" disabled={posted} onClick={() => onAction('TBB1')}>
            {posted ? 'Already Posted' : 'Post Accounting Entry'}
          </button>
        </>
      }
    >
      {leg && (
        <>
          <div className="section-label">Basic Details</div>
          <div className="field-grid cols3">
            <StaticField label="Company Code">{leg.entity}</StaticField>
            <StaticField label="Transaction No">{leg.rfha}</StaticField>
            <StaticField label="Deal Type">
              {leg.dealType}
              {leg.dssDeal ? ` / ${leg.dssDeal}` : ''}
            </StaticField>
          </div>
          <div className="buysell-box sell">
            <div className="buysell-head">Sell Currency</div>
            <div className="field-grid cols3">
              <StaticField label="Sell Amount">{fmtMoney(leg.sellCurr, leg.sellAmt)}</StaticField>
              <StaticField label="Bank Type">House Bank · Correspondent</StaticField>
              <StaticField label="FI Document">{leg.doc1 || NOT_POSTED}</StaticField>
            </div>
            <EntryTable lines={sellEntry(leg)} />
          </div>
          <div className="buysell-box buy">
            <div className="buysell-head">Buy Currency</div>
            <div className="field-grid cols3">
              <StaticField label="Buy Amount">{fmtMoney(leg.buyCurr, leg.buyAmt)}</StaticField>
              <StaticField label="All-in Rate">{fmtRate(leg.rate)}</StaticField>
              <StaticField label="FI Document">{leg.doc2 || NOT_POSTED}</StaticField>
            </div>
            <EntryTable lines={buyEntry(leg)} />
          </div>
        </>
      )}
    </ModalShell>
  )
}
