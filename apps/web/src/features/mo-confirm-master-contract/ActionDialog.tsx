import { useState } from 'react'
import { mcPdfSections } from '../../shared/pdf/mcPdf.ts'
import { fmtNum } from './format.ts'
import { McDialog } from './McDialog.tsx'
import type { Modal } from './modal.tsx'
import { pdfInput } from './pdfInput.ts'
import type { MasterContract, McAction } from './types.ts'

/**
 * The Confirm / Reject dialog, in the Create Master Contract screen's pop-up style: one contract opens as its sectioned details,
 * several as a table with their total, and a rejection asks for its remark.
 */
export function ActionDialog({
  modal,
  action,
  mcs,
  remark,
  remarkError,
  onRemarkChange,
  onProceed,
}: {
  modal: Modal
  action: McAction
  /** The contracts as they were when the dialog opened. */
  mcs: MasterContract[]
  remark: string
  remarkError: boolean
  onRemarkChange: (remark: string) => void
  onProceed: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const isReject = action === 'reject'
  const many = mcs.length > 1
  const total = mcs.reduce((sum, mc) => sum + mc.amtUSD, 0)
  const proceed = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onProceed()
    } finally {
      setBusy(false)
    }
  }
  const verb = isReject ? 'Reject' : 'Confirm'
  return (
    <McDialog
      open={modal.isOpen}
      title={`${verb} Master Contract${many ? 's' : ''}${!many && mcs[0] ? ` — ${mcs[0].mcNumber}` : ''}`}
      onClose={modal.close}
      busy={busy}
      ids={{ overlay: 'action-overlay', title: 'action-title', body: 'action-body', close: 'action-close-btn' }}
      actions={
        <>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={modal.close}>Cancel</button>
          <button className={`btn ${isReject ? 'btn-danger' : 'btn-primary'}`} type="button" id="action-confirm-btn" disabled={busy} onClick={() => void proceed()}>
            {busy ? 'Processing...' : `${verb} ${many ? `${mcs.length} Contracts` : 'Contract'}`}
          </button>
        </>
      }
    >
      <p id="action-subtitle" style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontWeight: 600 }}>
        Review {many ? `all ${mcs.length} selected contracts` : 'the contract details'} before {isReject ? 'rejecting' : 'confirming'}.
      </p>

      {many ? (
        <>
          <div className="popup-table-wrap">
            <table className="popup-table">
              <thead>
                <tr><th>MC Number</th><th>Reference</th><th>Origin</th><th>FX Model</th><th className="num">MC Amount (USD)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {mcs.map((mc) => (
                  <tr key={mc.mcNumber}>
                    <td><b>{mc.mcNumber}</b></td>
                    <td>{mc.mcDescription}</td>
                    <td>{mc.originEntity}</td>
                    <td>{mc.fxModel}</td>
                    <td className="num">{fmtNum(mc.amtUSD)}</td>
                    <td>{mc.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="kv-list" style={{ marginTop: 10 }}>
            <div className="kv-row kv-total"><span className="kv-label">Total MC Amount (USD)</span><span className="kv-value">{fmtNum(total)}</span></div>
          </div>
        </>
      ) : mcs[0] ? (
        mcPdfSections(pdfInput(mcs[0])).map((section) => (
          <div className="detail-section" key={section.title}>
            <div className="detail-section-title">{section.title}</div>
            <div className="detail-grid">
              {section.rows.map(([label, value]) => (
                <div className="detail-item" key={label}>
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : null}

      {isReject ? (
        <div className={`field${remarkError ? ' has-error' : ''}`} style={{ marginTop: 12 }}>
          <label htmlFor="action-remark">Rejection Remark<span className="req">*</span></label>
          <textarea
            id="action-remark"
            className="control"
            rows={2}
            maxLength={80}
            aria-invalid={remarkError}
            placeholder="Why is this Master Contract being rejected? This is recorded as the MO Remark."
            value={remark}
            disabled={busy}
            onChange={(e) => onRemarkChange(e.target.value)}
            style={{ width: '100%', resize: 'vertical', height: 'auto', padding: '8px 12px' }}
          />
          <div className="error-msg" id="action-remark-error">Please fill the MO Remarks and Update.</div>
        </div>
      ) : null}
    </McDialog>
  )
}
