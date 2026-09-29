import type { ReactNode } from 'react'
import { DmsPanel } from './DmsPanel.tsx'
import { formatAmount, toDisplayDate } from './format.ts'
import { buildFxRows, traderForRow } from './logic.ts'
import type { DmsDocState, ModalState } from './types.ts'

function InfoGrid({ fields }: { fields: Array<[string, string]> }) {
  return (
    <div className="detail-grid">
      {fields.map(([label, value]) => (
        <div className="detail-item" key={label}>
          <div className="detail-label">{label}</div>
          <div className="detail-value">{value || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function PopupField({ label, value, editable = false }: { label: string; value: string; editable?: boolean }) {
  return (
    <div>
      <label>{label}</label>
      <input defaultValue={value} readOnly={!editable} />
    </div>
  )
}

/** The legacy's single #modalOverlay, swapped per action — MC/Txn/Invoice display, the four
 * status-01 popups (Change/Confirm, Premium, Edit Pair, Cancel), a plain info note, and DMS. */
export function DetailModal({
  state,
  dmsState,
  dmsFeedback,
  onDmsFile,
  onDmsClear,
  onDmsComment,
  onClose,
}: {
  state: NonNullable<ModalState>
  dmsState: Record<string, DmsDocState>
  dmsFeedback: string
  onDmsFile: (docCode: string, file: File) => void
  onDmsClear: (docCode: string) => void
  onDmsComment: (docCode: string, value: string) => void
  onClose: () => void
}) {
  const [title, wide, body] = renderBody(state, dmsState, dmsFeedback, onDmsFile, onDmsClear, onDmsComment)
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal dms-modal' : 'modal'}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">
          <button className="primary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function renderBody(
  state: NonNullable<ModalState>,
  dmsState: Record<string, DmsDocState>,
  dmsFeedback: string,
  onDmsFile: (docCode: string, file: File) => void,
  onDmsClear: (docCode: string) => void,
  onDmsComment: (docCode: string, value: string) => void,
): [string, boolean, ReactNode] {
  switch (state.kind) {
    case 'invoice':
      return [
        'Invoice Status',
        false,
        <InfoGrid
          fields={[
            ['Deal ID', state.row.dealId],
            ['Invoice Status', state.row.invStatus || '—'],
            ['T1 (USD)', formatAmount(state.row.t1Amt)],
          ]}
        />,
      ]
    case 'change':
      return [
        'Change/Confirm',
        false,
        <div>
          <div className="sap-popup-form">
            <PopupField label="Deal ID" value={state.row.dealId} />
            <PopupField label="Deal ID Description" value={state.row.dealDesc} />
            <PopupField label="Invoice Plan" value={state.row.modelId} editable />
            <PopupField label="MC Ref No" value={state.row.mcRef} editable />
          </div>
          <div className="sap-popup-note">This mirrors screen 9001. Demo changes are not persisted.</div>
        </div>,
      ]
    case 'premium': {
      const row = state.row
      const base = Math.max(100000, Math.round(row.utiAmt * 0.01))
      return [
        'Premium Adjustment',
        false,
        <div className="sap-popup-form">
          <PopupField label="Deal Value" value={formatAmount(row.utiAmt)} />
          <PopupField label="Deal Currency" value="USD" />
          <PopupField label="Net Premium" value={formatAmount(base)} />
          <PopupField label="Premium Currency" value="USD" />
          <PopupField label="RBI Rate" value="83.2500000" />
          <PopupField label="RBI Rate Date" value={toDisplayDate(row.startDate)} />
          <PopupField label="Net Premium per USD" value={(base / row.utiAmt).toFixed(7)} />
          <PopupField label="Strike Rate" value="83.2500000" />
          <PopupField label="Invoice Rate" value="83.3700000" />
        </div>,
      ]
    }
    case 'editPair': {
      const fx = buildFxRows(state.row)[0]
      return [
        'Edit Deal Pair',
        false,
        <div>
          <div className="sap-popup-form">
            <PopupField label="Deal Type" value={fx?.type ?? 'D1'} />
            <PopupField label="Company Code" value={fx?.bukrs ?? 'IN11'} />
            <PopupField label="Old Transaction" value={fx?.rfha ?? ''} />
            <PopupField label="New Transaction" value="" editable />
          </div>
          <div className="sap-popup-note">New Transaction has F4/value-help in SAP screen 9004.</div>
        </div>,
      ]
    }
    case 'cancel': {
      const trader = traderForRow(state.row)
      return [
        'Cancel Deal ID',
        false,
        <div>
          <div className="sap-popup-form">
            <PopupField label="Deal ID" value={state.row.dealId} />
            <PopupField label="MC Ref No" value={state.row.mcRef} />
            <PopupField label="FX Model ID" value={state.row.modelId} />
            <PopupField label="Trader" value={trader.code} />
          </div>
          <div className="sap-popup-note">Cancel Deal ID is available for status 01 in the attached SAP program.</div>
        </div>,
      ]
    }
    case 'info':
      return [state.title, false, <div className="sap-popup-note">{state.message}</div>]
    case 'dms':
      return ['DMS', true, <DmsPanel row={state.row} state={dmsState} feedback={dmsFeedback} onFileChange={onDmsFile} onClear={onDmsClear} onCommentChange={onDmsComment} />]
    default:
      return ['Details', false, null]
  }
}
