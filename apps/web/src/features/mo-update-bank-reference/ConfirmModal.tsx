import { STATUS_DESC } from './data.ts'
import { fmtDate } from './format.ts'
import { statusText } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { Deal } from './types.ts'

/**
 * Change / Confirm (ABAP screen 9001). `deal` is the snapshot taken when the popup opened, so
 * it keeps its content while fading out after a confirmation.
 */
export function ConfirmModal({
  open,
  deal,
  onClose,
  onConfirm,
}: {
  open: boolean
  deal: Deal | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay id="confirm-modal" open={open} onClose={onClose}>
      <div className="modal-card">
        <ModalHeader
          title="MO Confirmation"
          subtitle={deal ? `Deal ID ${deal.dealId} – MC ${deal.mcRef}` : ''}
          subtitleId="cf-subtitle"
          onClose={onClose}
        />
        <div className="modal-body">
          <div className="detail-grid" id="cf-detailgrid">
            {deal && (
              <>
                <DetailCell label="Deal ID" value={deal.dealId} />
                <DetailCell label="MC Reference No" value={deal.mcRef} />
                <DetailCell label="FX Model" value={`${deal.model} – ${deal.modelDesc}`} />
                <DetailCell label="Deal ID Status" value={statusText(deal.status)} />
                <DetailCell label="Deal Start Date" value={fmtDate(deal.dealStart)} />
                <DetailCell label="Deal End Date" value={fmtDate(deal.dealEnd)} />
                <DetailCell label="Ship Start Date" value={fmtDate(deal.shipStart)} />
                <DetailCell label="Ship End Date" value={fmtDate(deal.shipEnd)} />
                <DetailCell label="Entity String" value={deal.entChain.join(' → ')} />
                <DetailCell label="Currency String" value={deal.currChain.join(' → ')} />
              </>
            )}
          </div>
          <div id="cf-warn">{deal && <ConfirmWarning deal={deal} />}</div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-confirm"
            id="cf-confirm-btn"
            type="button"
            style={deal && deal.status !== '01' ? { display: 'none' } : undefined}
            onClick={onConfirm}
          >
            Confirm Deal ID
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function ConfirmWarning({ deal }: { deal: Deal }) {
  if (deal.status === '30') return <div className="err-box">This Deal ID has been cancelled and can no longer be confirmed.</div>
  if (deal.status !== '01') {
    return (
      <div className="warn-box">
        This Deal ID is already <strong>{STATUS_DESC[deal.status]}</strong>. Use <strong>Reverse Confirmation</strong> from the toolbar if it needs
        to be reopened.
      </div>
    )
  }
  return (
    <div className="warn-box">
      Confirming locks in the D1/D2 FX legs against this Master Contract and sets the Deal ID to <strong>02 - Confirmed by MO</strong>. This cannot
      be edited afterwards except via Premium Adjustment or Edit Deal Pair.
    </div>
  )
}
