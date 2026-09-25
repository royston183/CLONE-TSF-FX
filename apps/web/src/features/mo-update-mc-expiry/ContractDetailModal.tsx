import type { ReactNode } from 'react'
import { formatAmount, formatRate } from './format.ts'
import { eligibilityLabel, statusClass } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract } from './types.ts'

function Row({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="detail-row">
      <span className="dl">{label}</span>
      <span className="dv">{empty ? '—' : value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-section">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

/** Master Contract Details, opened from the MC number link or a row double-click. */
export function ContractDetailModal({
  modal,
  contract: c,
  keyDate,
}: {
  modal: Modal
  contract: MasterContract | undefined
  keyDate: Date | null
}) {
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3>{c ? `Master Contract ${c.mcNumber}` : 'Master Contract Details'}</h3>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="details-grid">
            {c ? (
              <>
                <Section title="Basic Details">
                  <Row label="Status" value={<span className={`status-text ${statusClass(c.status)}`}>{c.status}</span>} />
                  <Row label="MC Number" value={c.mcNumber} />
                  <Row label="MC Reference No" value={c.mcReferenceNo} />
                  <Row label="MC Description" value={c.mcDescription} />
                  <Row label="MC Date" value={c.mcDate} />
                  <Row label="Client" value={c.client} />
                  <Row label="Seller" value={c.seller} />
                  <Row label="Buyer" value={c.buyer} />
                  <Row label="Origin Entity" value={c.originEntity} />
                </Section>

                <Section title="Financial Details">
                  <Row label="MC Amount" value={`${formatAmount(c.mcAmount)} ${c.currency}`} />
                  <Row label="MC Amount (Origin)" value={`${formatAmount(c.mcAmountOrigin)} ${c.originCurrency}`} />
                  <Row label="Exchange Rate" value={formatRate(c.exchangeRate)} />
                  <Row label="Utilization" value={formatAmount(c.utilization)} />
                  <Row label="Balance Amount" value={formatAmount(c.balanceAmount)} />
                  <Row label="Entity ID" value={c.entityId} />
                  <Row label="Entity String" value={c.entityString} />
                  <Row label="Currency String" value={c.currencyString} />
                </Section>

                <Section title="Commodity Details">
                  <Row label="GT Commodity" value={c.gtCommodity} />
                  <Row label="Commodity" value={c.commodity} />
                  <Row label="Commodity Description" value={c.commodityDescription} />
                </Section>

                <Section title="Shipment Details">
                  <Row label="Shipment Start" value={c.shipmentStart} />
                  <Row label="Shipment End" value={c.shipmentEnd} />
                  <Row label="Payment Terms" value={c.paymentTerms} />
                  <Row label="Port of Shipment" value={c.portOfShipment} />
                  <Row label="Port of Destination" value={c.portOfDestination} />
                </Section>

                <Section title="FX Model Details">
                  <Row label="FX Model" value={c.fxModel} />
                  <Row label="Model Description" value={c.modelDescription} />
                </Section>

                <Section title="Expiry Information">
                  <Row label="Days Outstanding" value={c.days} />
                  <Row label="Eligible for Selected Key Date" value={eligibilityLabel(c, keyDate)} />
                  <Row label="MO Remarks" value={c.moRemarks} />
                  <Row label="FO Remarks" value={c.foRemarks} />
                  <Row label="Created MC" value={c.createdMC} />
                  <Row label="Entered By / On" value={`${c.enteredBy} — ${c.enteredOn} ${c.entryTime}`} />
                  <Row label="Changed By / On" value={`${c.changedBy} — ${c.changedOn} ${c.changeTime}`} />
                </Section>
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
