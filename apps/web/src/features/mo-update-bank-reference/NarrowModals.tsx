import { ModalHeader, Overlay } from './modal.tsx'

type Props = { open: boolean; onClose: () => void }

/** Cancel Deal ID (ABAP screen 9005). */
export function CancelModal({ open, dealId, onClose, onConfirm }: Props & { dealId: string; onConfirm: () => void }) {
  return (
    <Overlay id="cancel-modal" open={open} onClose={onClose}>
      <div className="modal-card narrow">
        <ModalHeader title="Cancel Deal ID" onClose={onClose} />
        <div className="modal-body">
          <div className="err-box">
            Cancelling <strong id="cn-dealid">{dealId}</strong> removes it from this Master Contract permanently. Any planned invoices linked to it are
            deleted. This cannot be undone.
          </div>
          <p style={{ fontSize: '12.5px' }}>Are you sure you want to cancel this Deal ID?</p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Keep Deal ID
          </button>
          <button className="btn-confirm is-reject" type="button" onClick={onConfirm}>
            Yes, Cancel Deal ID
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Reverse MO Confirmation: back to 01 - Not Confirmed. */
export function ReverseModal({ open, dealId, onClose, onConfirm }: Props & { dealId: string; onConfirm: () => void }) {
  return (
    <Overlay id="reverse-modal" open={open} onClose={onClose}>
      <div className="modal-card narrow">
        <ModalHeader title="Reverse MO Confirmation" onClose={onClose} />
        <div className="modal-body">
          <div className="warn-box">
            This sends <strong id="rv-dealid">{dealId}</strong> back to <strong>01 - Not Confirmed</strong> and deletes any planned trade-invoice data
            captured for it.
          </div>
          <p style={{ fontSize: '12.5px' }}>Reverse the confirmation for this Deal ID?</p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            No
          </button>
          <button className="btn-confirm is-reject" type="button" onClick={onConfirm}>
            Yes, Reverse
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Document Management: the page only ever showed the empty state. */
export function DmsModal({ open, onClose }: Props) {
  return (
    <Overlay id="dms-modal" open={open} onClose={onClose}>
      <div className="modal-card narrow">
        <ModalHeader title="Document Management (DMS)" onClose={onClose} />
        <div className="modal-body">
          <p style={{ fontSize: '12.5px', lineHeight: 1.7 }}>
            No documents are attached to this Deal ID yet. Once the shipment's Bill of Lading is available, the Trade Flow team attaches it here — that
            attachment is what links a physical shipment to this specific Deal ID for invoicing.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
