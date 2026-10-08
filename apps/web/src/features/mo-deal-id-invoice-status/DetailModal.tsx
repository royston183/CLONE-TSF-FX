import type { ReactNode } from 'react'
import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import { DmsPanel } from './DmsPanel.tsx'
import { formatAmount } from './format.ts'
import type { DmsDocState, ModalState } from './types.ts'

/** The workspace popups belong to ZSGTSF_PDEAL_ID_ANALYS (screens 9001-9004), not in this export. */
const WAITING_ACTION = 'WAITING FOR ACTION API — Deal ID Analysis (ZSGTSF_PDEAL_ID_ANALYS) actions have no API yet. Nothing is saved to SAP.'
const WAITING_ANALYSIS_API = 'WAITING FOR API — premium and rates are read by ZSGTSF_PDEAL_ID_ANALYS, which is not in this export.'

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
  if (state.kind === 'info') {
    return <ResultDialog tone="info" title={state.title} message={state.message} actions={[{ label: 'Close', kind: 'primary', onClick: onClose }]} />
  }
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
          <div className="sap-popup-note">{WAITING_ACTION}</div>
        </div>,
      ]
    case 'premium':
      // Premium, RBI rate and strike are ZSGTSF_PDEAL_ID_ANALYS's FX/option reads (not in this
      // export): the fields stay empty rather than show generated rates.
      return [
        'Premium Adjustment',
        false,
        <div>
          <div className="sap-popup-form">
            <PopupField label="Deal Value" value={state.row.utiAmt === null ? '' : formatAmount(state.row.utiAmt)} />
            <PopupField label="Deal Currency" value="" />
            <PopupField label="Net Premium" value="" />
            <PopupField label="Premium Currency" value="" />
            <PopupField label="RBI Rate" value="" />
            <PopupField label="RBI Rate Date" value="" />
            <PopupField label="Net Premium per USD" value="" />
            <PopupField label="Strike Rate" value="" />
            <PopupField label="Invoice Rate" value="" />
          </div>
          <div className="sap-popup-note">{WAITING_ANALYSIS_API}</div>
        </div>,
      ]
    case 'editPair':
      // D1 as ZSGTSFTR_DEALID holds it: ZBUKRS1 / ZRFHA1.
      return [
        'Edit Deal Pair',
        false,
        <div>
          <div className="sap-popup-form">
            <PopupField label="Deal Type" value="D1" />
            <PopupField label="Company Code" value={state.row.bukrs1} />
            <PopupField label="Old Transaction" value={state.row.rfha1} />
            <PopupField label="New Transaction" value="" editable />
          </div>
          <div className="sap-popup-note">{WAITING_ACTION}</div>
        </div>,
      ]
    case 'cancel': {
      const trader = { code: state.row.trader }
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
          <div className="sap-popup-note">{WAITING_ACTION}</div>
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
