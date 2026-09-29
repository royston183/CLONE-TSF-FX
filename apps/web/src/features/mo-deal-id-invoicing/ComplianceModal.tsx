export type ComplianceNote = { kind: 'ok' | 'warn'; message: string }

/** "BL Compliance Checklist" (screen 9002): the fixed eight-item checklist plus the tolerance note before confirming invoice generation. */
export function ComplianceModal({
  dealId,
  lineCount,
  note,
  onClose,
  onConfirm,
}: {
  dealId: string
  lineCount: number
  note: ComplianceNote
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 660 }}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 8h6M9 12l1.5 1.5L13 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="modal-header-text">
            <div className="modal-title">BL Compliance Checklist</div>
            <div className="modal-subtitle">
              Deal ID {dealId} — {lineCount} line(s) selected for invoicing
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <ol className="checklist">
            <li>Port of loading, Port of Discharge, Commodity, shipment date for the selected BL shall match with the requirements of the Master Contract for which the BL is being selected.</li>
            <li>Load Port, Discharge Port, Origin of goods shall not be from any of Countries in OFAC list.</li>
            <li>Scanned copies of OBL shall be used for TSF Merchanting book. No Seaway Bills/ Draft BLs are accepted for FX invoicing.</li>
            <li>
              Consignee should be To Order. If Consignee is third party BL or Bank on the BL, such BL shall not be acceptable unless approved otherwise. If approved, the bank on face of BL, and Bank for
              TSF transaction (FX + Document Submission) shall be different. In no case can the BL be used for FX transaction/Document Submission at the same bank as that appearing on BL.
            </li>
            <li>
              If the BL has LC details, the bank handling the BU documentation shouldn&apos;t be same as that of TSF. If BU is routing documents through Bank on Buy or Sell Leg, TSF cannot use these BL for
              invoicing the FX transaction with these banks — there cannot be an overlap between BU banks and TSF banks for the same BL.
            </li>
            <li>The date of PO/Contract shall be in line with the title date.</li>
            <li>The title of the goods must be with OIL on the date of TSF invoicing.</li>
            <li>Shipment/vessel should be in transit at the time of bundling the invoice. The TSF invoice date in no case can be after the vessel discharge date.</li>
          </ol>
          <div className={note.kind === 'ok' ? 'ok-box' : 'warn-box'}>{note.message}</div>
          <div style={{ marginTop: 14, fontWeight: 700 }}>Do you want to Proceed?</div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={onConfirm}>
            Yes
          </button>
        </div>
      </div>
    </div>
  )
}
