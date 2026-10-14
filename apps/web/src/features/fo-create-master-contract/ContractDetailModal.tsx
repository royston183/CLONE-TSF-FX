import type { ReactNode } from 'react'
import { DEFAULT_STATUS_META, STATUS_META, findPaymentTerm } from './data.ts'
import { formatAmount, formatRate, formatTolerance } from './format.ts'
import { commodityNames } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract } from './types.ts'

function Item({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{empty ? '—' : value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">{title}</div>
      <div className="detail-grid">{children}</div>
    </div>
  )
}

export function ContractDetailModal({
  modal,
  contract: c,
  childCount,
  onChildren,
  onCopy,
  onEdit,
  onSendToMO,
  onLinkedDeals,
  canViewDeals,
}: {
  modal: Modal
  contract: MasterContract | undefined
  childCount: number
  onChildren: (c: MasterContract) => void
  onCopy: (c: MasterContract) => void
  onEdit: (c: MasterContract) => void
  onSendToMO: (c: MasterContract) => void
  onLinkedDeals: (c: MasterContract) => void
  canViewDeals: boolean
}) {
  const meta = c ? (STATUS_META[c.status] ?? DEFAULT_STATUS_META) : DEFAULT_STATUS_META
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable contract-detail-modal">
        <div className="modal-head-row">
          <h2>{c ? `Master Contract Details — ${c.mcNumber}` : 'Master Contract Details'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll">
          {c ? (
            <>
              <Section title="Basic Details">
                <Item
                  label="Status"
                  value={
                    <span className={`status-pill ${meta.cls}`}>
                      <span className="status-dot" />
                      {c.status}
                    </span>
                  }
                />
                <Item label="MC Number" value={c.mcNumber} />
                <Item label="Origin Entity" value={c.originEntity + (c.originEntityName ? ` - ${c.originEntityName}` : '')} />
                <Item label="MC Date" value={c.mcDate} />
                <Item label="MC Reference No" value={c.reference} />
                <Item label="Child Contracts" value={String(childCount)} />
                {c.linkedDealId ? <Item label="Linked Deal ID" value={
                  <button type="button" className="btn btn-ghost" disabled={!canViewDeals} onClick={() => onLinkedDeals(c)}>{c.linkedDealId}</button>
                } /> : null}
              </Section>

              <Section title="Financial Details">
                <Item label="MC Amount (USD)" value={formatAmount(c.mcAmountUsd)} />
                <Item label="MC Amount (Origin)" value={formatAmount(c.mcAmountOrigin) + (c.originCurrency ? ` ${c.originCurrency}` : '')} />
                <Item label="Exchange Rate" value={formatRate(c.exchangeRate)} />
                <Item label="Tolerance %" value={formatTolerance(c.tolerance)} />
              </Section>

              <Section title="Commodity Details">
                <Item label="Commodity" value={c.commodityName} />
                <Item label="Commodity Code" value={c.commodityCode} />
                {c.selectedCommodities && c.selectedCommodities.length ? (
                  <Item label="Selected Commodities" value={commodityNames(c.selectedCommodities).join(', ')} />
                ) : null}
              </Section>

              <Section title="Shipment Details">
                <Item label="Shipment Start" value={c.shipStart} />
                <Item label="Shipment End" value={c.shipEnd} />
                <Item label="Payment Terms" value={findPaymentTerm(c.paymentTerms)?.label ?? (c.paymentTerms || '—')} />
                <Item label="Payment Date" value={c.paymentDate} />
                <Item label="Port of Shipment" value={c.portShipment} />
                <Item label="Port of Destination" value={c.portDestination} />
              </Section>

              <Section title="FX Model Details">
                <Item label="FX Model" value={c.fxModelCode + (c.fxModelDesc ? ` - ${c.fxModelDesc}` : '')} />
                <Item label="Entity String" value={c.entityString} />
                <Item label="Currency String" value={c.currencyString} />
              </Section>
            </>
          ) : null}
        </div>
        <div className="modal-actions contract-detail-actions">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Close
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => c && onChildren(c)}>
            Child Contracts
          </button>
          <button className="btn btn-secondary" type="button" disabled={!c || !canViewDeals} onClick={() => c && onLinkedDeals(c)}
            title={canViewDeals ? undefined : 'Linked Deal IDs are unavailable while contracts are offline.'}>
            Linked Deal IDs
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => c && onCopy(c)}>
            Copy
          </button>
          <button className="btn btn-primary" type="button" onClick={() => c && onEdit(c)}>
            Edit
          </button>
          <button className="btn btn-danger" type="button" onClick={() => c && onSendToMO(c)}>
            Send to M.O.
          </button>
        </div>
      </div>
    </Overlay>
  )
}
