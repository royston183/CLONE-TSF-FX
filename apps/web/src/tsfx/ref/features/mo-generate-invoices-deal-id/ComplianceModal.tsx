import { statusText } from './format.ts'
import type { DealStatus } from './types.ts'

const CHECKLIST = [
  'Port of loading, Port of Discharge, Commodity and shipment date for the selected BL shall match the requirements of the Master Contract for which the BL is being selected.',
  'Load Port, Discharge Port and Origin of goods shall not be from any of the Countries in the OFAC list.',
  'Scanned copies of OBL shall be used for TSF Merchanting book. No Seaway Bills / Draft BLs are accepted for FX invoicing.',
  'Consignee should be "To Order". If Consignee is "third party BL" or "Bank" on the BL, such BL shall not be acceptable unless approved otherwise. If approved, the bank on face of BL and Bank for TSF transaction shall be different.',
  'If the BL has LC details, the bank handling BU documentation should not be the same as that of TSF.',
  'If BU is routing documents through Bank on Buy or Sell Leg, TSF cannot use these BL for invoicing the FX transaction with these banks.',
  'There cannot be an overlap between BU banks and TSF banks for the same BL.',
  'The date of PO / Contract shall be in line with the title date.',
  'The title of the goods must be with OIL on the date of TSF invoicing.',
  'Shipment / vessel should be in transit at the time of bundling the invoice. The TSF invoice date cannot be after the vessel discharge date.',
]

/** "BL Compliance Checklist": the legacy #complianceModal, gating Confirm Invoice -> Proceed -> saveInvoice. */
export function ComplianceModal({ resultingStatus, onClose, onProceed }: { resultingStatus: DealStatus; onClose: () => void; onProceed: () => void }) {
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal lg">
        <div className="modal-head">
          <div className="modal-title">BL Compliance Checklist</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <ol className="checklist">
            {CHECKLIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="proceed-box">
            Do you want to proceed? Resulting Deal ID status: <strong>{statusText(resultingStatus)}</strong>
          </div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-btn primary" type="button" onClick={onProceed}>
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
