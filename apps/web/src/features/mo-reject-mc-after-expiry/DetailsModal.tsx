import type { ReactNode } from 'react'
import { StatusText } from './ContractsTable.tsx'
import { formatAmount } from './format.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract } from './types.ts'

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="dl">{label}</span>
      <span className="dv">{value !== undefined && value !== null && value !== '' ? value : '—'}</span>
    </div>
  )
}

/** #detailsOverlay — every field of one Master Contract, opened from its number or a double-click. */
export function DetailsModal({
  modal,
  contract: c,
  onClose,
}: {
  modal: Modal
  contract: MasterContract | undefined
  onClose: () => void
}) {
  return (
    <Overlay modal={modal} id="detailsOverlay" onBackdrop={onClose}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 id="detailsTitle">{c ? `Master Contract ${c.mcNumber}` : 'Master Contract Details'}</h3>
          <button className="modal-close" id="detailsCloseBtn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="details-grid" id="detailsGrid">
            {c ? (
              <>
                <div className="detail-section">
                  <h4>Basic Details</h4>
                  <DetailRow label="MC Reference No" value={c.mcReferenceNo} />
                  <DetailRow label="MC Date" value={c.mcDate} />
                  <DetailRow label="MC Description" value={c.mcDescription} />
                  <DetailRow label="MC Status" value={<StatusText status={c.status} />} />
                  <DetailRow label="Origin" value={`${c.originEntity} — ${c.originEntityName}`} />
                  <DetailRow label="MC Amount (USD)" value={`${formatAmount(c.mcAmountUSD)} ${c.currency}`} />
                  <DetailRow label="MC Amount (Origin)" value={`${formatAmount(c.mcAmountOrigin)} ${c.originCurrency}`} />
                  <DetailRow label="Exchange Rate" value={Number(c.exchangeRate).toFixed(4)} />
                  <DetailRow label="Commodity" value={`${c.gtCommodity} — ${c.commodity}`} />
                  <DetailRow label="Comm Description Long" value={c.commodityDescriptionLong} />
                </div>

                <div className="detail-section">
                  <h4>Shipment Details</h4>
                  <DetailRow label="Shipment Start Date" value={c.shipmentStart} />
                  <DetailRow label="Shipment End Date" value={c.shipmentEnd} />
                  <DetailRow label="Port of Shipment" value={c.portOfShipment} />
                  <DetailRow label="Port of Destination" value={c.portOfDestination} />
                  <DetailRow label="Payment Terms" value={`${c.paymentTerms} — ${c.paymentTermsDesc}`} />
                </div>

                <div className="detail-section">
                  <h4>FX Model Details</h4>
                  <DetailRow label="FX Model" value={c.fxModel} />
                  <DetailRow label="FX Model Description" value={c.modelDescription} />
                  <DetailRow label="Entity String" value={c.entityString} />
                  <DetailRow label="Currency String" value={c.currencyString} />
                </div>

                <div className="detail-section">
                  <h4>Additional Information</h4>
                  <DetailRow label="Utilization" value={formatAmount(c.utilization)} />
                  <DetailRow label="Balance Amount" value={formatAmount(c.balanceAmount)} />
                  <DetailRow label="Business Partner D1" value={c.businessPartnerD1} />
                  <DetailRow label="Business Partner D2" value={c.businessPartnerD2} />
                  <DetailRow label="MO Remarks" value={c.moRemarks} />
                  <DetailRow label="FO Remarks" value={c.foRemarks} />
                  <DetailRow label="Created MC Reference" value={c.createdMCReference} />
                  <DetailRow label="Entered By / On" value={`${c.enteredBy} — ${c.enteredOn}`} />
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" id="detailsFooterCloseBtn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
