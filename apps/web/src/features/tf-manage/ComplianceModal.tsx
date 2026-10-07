/** The eight-point checklist from legacy/Manage TF.html's #complianceOverlay, verbatim. */
const CHECKLIST_ITEMS: readonly string[] = [
  `1. Port of loading, Port of Discharge, Commodity, shipment date for the selected BL shall
   match with the requirements of the Master Contract for which the BL is being selected.`,
  '2. Load Port, Discharge Port, Origin of goods shall not be from any of Countries in OFAC list.',
  `3. Scanned copies of OBL shall be used for TSF Merchanting book. No Seaway Bils/ Draft BL's
   are accepted for FX invoicing.`,
  `4. Consignee should be 'To Order'. If Consignee is "third party BL" or "Bank", such BL shall
   not be acceptable unless approved otherwise. If approved, the bank on face of BL, and Bank
   for TSF transaction (FX+ Document Submission) shall be different. In no case, the BL can be
   used for FX transaction/ Document Submission at the same bank as that appearing on BL.`,
  `5. If the BL has LC details, the bank who is handling the BU documentation shouldn't be same
   as that of TSF.`,
  `6. If BU is routing documents through Bank on Buy or Sell Leg, TSF cannot use these BL for
   invoicing the FX transaction with these banks.`,
  '7. In other words, there cannot be an overlap between BU banks and TSF banks for same BL.',
  `8. Invoice shall be created only on "Current market price" (+/- 5%) on the date of TSF
   invoicing. Any deviation shall be approved as per Trade flow Policy.`,
]

export type ComplianceModalProps = {
  open: boolean
  onCancel: () => void
  onProceed: () => void
}

/** BL Data 1's "BL Compliance Checklist" gate, shown before the Assign Deal ID popup opens. */
export function ComplianceModal({ open, onCancel, onProceed }: ComplianceModalProps) {
  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="complianceModalTitle">
        <div className="modal-head">
          <div className="modal-title" id="complianceModalTitle">
            BL Compliance Checklist
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="compliance-list">
            {CHECKLIST_ITEMS.map((item, index) => (
              <div className="compliance-item" key={index}>
                {item}
              </div>
            ))}
          </div>
          <div>Do you want to Proceed</div>
        </div>
        <div className="modal-footer">
          {/* An empty leading child so the shared .modal-footer{justify-content:space-between}
              rule (see tf-manage.legacy.css) pushes this single group to the right, the way it
              does for the workspace footer's hint-span + .modal-actions pair. */}
          <span />
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onProceed}>
              Yes With Exception
            </button>
            <button type="button" className="hdr-btn primary" onClick={onProceed}>
              Yes
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
