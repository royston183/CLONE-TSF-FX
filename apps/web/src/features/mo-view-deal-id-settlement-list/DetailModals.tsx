import { fmtDate, fmtNum } from './format.ts'
import { dealsForMc, invoiceLegs, regionName } from './logic.ts'
import { DetailCell, ModalHeader, Overlay, type ModalTarget } from './modal.tsx'
import { StatusCell } from './DealTable.tsx'
import type { Deal, MasterContract } from './types.ts'

/** Deal ID details; links through to the Master Contract and the Trade Invoice drill-down. */
export function DealModal({
  modal,
  deal,
  mc,
  onOpenMc,
  onOpenInvoices,
}: {
  modal: ModalTarget
  deal: Deal | undefined
  mc: MasterContract | undefined
  onOpenMc: (mcRef: string) => void
  onOpenInvoices: (dealId: string) => void
}) {
  return (
    <Overlay isOpen={modal.isOpen} onClose={modal.close} maxWidth={760}>
      <ModalHeader
        icon={'\u{1F4C4}'}
        title={deal ? `Deal ID ${deal.dealId}` : 'Deal ID Details'}
        subtitle={deal?.dealDesc ?? ''}
        onClose={modal.close}
      />
      <div className="modal-body">
        {deal && mc ? (
          <div className="detail-grid">
            <DetailCell label="Deal ID" value={deal.dealId} accent />
            <DetailCell label="Deal Type / Sub Type" value={`${deal.dealType} / ${deal.subType}`} />
            <DetailCell
              label="Master Contract"
              value={
                <a
                  className="tbl-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    modal.close()
                    onOpenMc(deal.mcRef)
                  }}
                >
                  {deal.mcRef}
                </a>
              }
            />
            <DetailCell label="MC Description" value={`${mc.commodityDesc} (${mc.qty})`} />
            <DetailCell label="FX Model" value={`${deal.fxModel} - ${deal.modelDesc}`} />
            <DetailCell label="Origin Entity" value={deal.origin} />
            <DetailCell label="Region" value={regionName(deal.region)} />
            <DetailCell label="CO Area" value={deal.coArea} />
            <DetailCell label="Status" value={`${deal.status} - ${deal.statusDesc}`} accent />
            <DetailCell label="Confirmed" value={deal.confirm ? 'Yes' : 'No'} />
            <DetailCell label="Trade Date" value={fmtDate(deal.tradeDate)} />
            <DetailCell label="Value Date" value={fmtDate(deal.valueDate)} />
            <DetailCell label="Revised End Date" value={fmtDate(deal.revisedEndDate)} />
            <DetailCell label="Fixing Day" value={fmtDate(deal.fixingDay)} />
            <DetailCell label="Partner name" value={deal.partner} />
            <DetailCell label="P&L" value={`${deal.plCurr} ${fmtNum(deal.plAmt)}`} />
            <DetailCell label="P&L Rate" value={deal.plRate} />
            <DetailCell label="Utilized Amt (USD)" value={fmtNum(deal.utiAmt)} />
            <DetailCell label="Save Spot Data" value={deal.spot ? 'Saved' : 'Not saved'} />
            <DetailCell
              label="Created By / On"
              value={`${deal.createdBy} / ${fmtDate(deal.createdDate)} ${deal.createdTime}`}
            />
            <DetailCell
              label="Changed By / On"
              value={deal.changedBy ? `${deal.changedBy} / ${fmtDate(deal.changedDate)} ${deal.changedTime}` : ''}
            />
          </div>
        ) : (
          <div className="detail-grid"></div>
        )}
        <div className="note">
          <strong>Note:</strong> Clicking the Deal ID itself in the list does exactly this - plus a drill-through into
          its Trade Invoices (<em>SUBMIT ZSGTSF_RDEAL_TRD_INV ... AND RETURN</em>), reproduced below as a modal
          instead of a full screen navigation.
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-cancel" onClick={modal.close}>
          Close
        </button>
        <button
          className="btn-confirm"
          onClick={() => {
            if (!deal) return
            modal.close()
            onOpenInvoices(deal.dealId)
          }}
        >
          View Trade Invoices
        </button>
      </div>
    </Overlay>
  )
}

/** Master Contract details (ZSGTSFFM_MC_DETAILS), its entity string and sibling Deal IDs. */
export function McModal({
  modal,
  mc,
  deals,
  onOpenDeal,
  onFilterByMc,
}: {
  modal: ModalTarget
  mc: MasterContract | undefined
  deals: readonly Deal[]
  onOpenDeal: (dealId: string) => void
  onFilterByMc: (mcRef: string) => void
}) {
  const related = mc ? dealsForMc(deals, mc.mcRef) : []
  return (
    <Overlay isOpen={modal.isOpen} onClose={modal.close} maxWidth={820}>
      <ModalHeader
        icon={'\u{1F4C4}'}
        title={mc ? `Master Contract ${mc.mcRef}` : 'Master Contract Details'}
        subtitle={mc ? `Function module ZSGTSFFM_MC_DETAILS · ${mc.commodityDesc}` : 'Function module ZSGTSFFM_MC_DETAILS'}
        onClose={modal.close}
      />
      <div className="modal-body">
        <div className="detail-grid">
          {mc ? (
            <>
              <DetailCell label="Master Contract Ref." value={mc.mcRef} accent />
              <DetailCell label="Commodity" value={mc.commodityDesc + (mc.qty !== 'n/a' ? ` (${mc.qty})` : '')} />
              <DetailCell label="FX Model" value={`${mc.fxModel} - ${mc.modelDesc}`} />
              <DetailCell label="Origin Entity" value={mc.originEntity} />
              <DetailCell label="Region" value={regionName(mc.region)} />
              <DetailCell label="MC Date" value={fmtDate(mc.mcDate)} />
              <DetailCell label="MC Amount (USD)" value={fmtNum(mc.amtUSD)} />
              <DetailCell label="Shipping Window" value={`${fmtDate(mc.shipStart)} → ${fmtDate(mc.shipEnd)}`} />
              <DetailCell label="Port of Shipment" value={mc.portOfShipment} />
              <DetailCell label="Port of Destination" value={mc.portOfDestination} />
            </>
          ) : null}
        </div>

        <div className="section-label">Entity String</div>
        <div className="entity-flow">
          {mc?.entities.map((e, i) => (
            <span key={`${e}${i}`} style={{ display: 'contents' }}>
              <span className="ent-chip">
                {e} <span style={{ opacity: 0.7, fontWeight: 500 }}>({mc.currChain[i]})</span>
              </span>
              {i < mc.entities.length - 1 ? <span className="arrow">&#8594;</span> : null}
            </span>
          ))}
        </div>

        <div className="section-label">Deal IDs booked under this Master Contract</div>
        <div className="table-wrap">
          <table className="list-table">
            <thead>
              <tr>
                <th className="left">Deal ID</th>
                <th className="left">Status</th>
                <th className="left">Trade Date</th>
                <th className="left">Value Date</th>
                <th className="left">Partner name</th>
                <th>Utilized Amt (USD)</th>
              </tr>
            </thead>
            <tbody>
              {related.map((d) => (
                <tr key={d.dealId}>
                  <td>
                    <a
                      className="tbl-link deal-id"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        modal.close()
                        onOpenDeal(d.dealId)
                      }}
                    >
                      {d.dealId}
                    </a>
                  </td>
                  <td>
                    <StatusCell deal={d} />
                  </td>
                  <td>{fmtDate(d.tradeDate)}</td>
                  <td>{fmtDate(d.valueDate)}</td>
                  <td>{d.partner}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(d.utiAmt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">
          {mc ? (
            <>
              <strong>Note:</strong> {related.length} Deal ID{related.length === 1 ? '' : 's'} booked under this Master
              Contract so far &mdash; one Master Contract can carry several Deal IDs over its life, each one its own FX
              Deal and, once shipped, its own set of invoices.
            </>
          ) : null}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-cancel" onClick={modal.close}>
          Close
        </button>
        <button
          className="btn-confirm"
          onClick={() => {
            if (!mc) return
            modal.close()
            onFilterByMc(mc.mcRef)
          }}
        >
          Show only this Master Contract in the list
        </button>
      </div>
    </Overlay>
  )
}

/** Trade invoices for a Deal ID (ZSGTSF_RDEAL_TRD_INV): one invoice per entity-string leg. */
export function InvoiceModal({
  modal,
  deal,
  mc,
}: {
  modal: ModalTarget
  deal: Deal | undefined
  mc: MasterContract | undefined
}) {
  const rows = deal && mc ? invoiceLegs(deal, mc) : []
  return (
    <Overlay isOpen={modal.isOpen} onClose={modal.close} maxWidth={900}>
      <ModalHeader
        icon={'\u{1F9FE}'}
        title={deal ? `Trade Invoices for Deal ID ${deal.dealId}` : 'Trade Invoices for Deal ID'}
        subtitle={
          deal
            ? `Report ZSGTSF_RDEAL_TRD_INV · SUBMIT ... WITH p_deal = '${deal.dealId}' AND RETURN`
            : 'Report ZSGTSF_RDEAL_TRD_INV'
        }
        onClose={modal.close}
      />
      <div className="modal-body">
        <div className="detail-grid">
          {deal && mc ? (
            <>
              <DetailCell label="Deal ID" value={deal.dealId} accent />
              <DetailCell label="Master Contract" value={mc.mcRef} />
              <DetailCell label="FX Model / Entity String" value={`${deal.fxModel} (${mc.entities.join(' → ')})`} />
              <DetailCell
                label="FX Spread Profit (P&L)"
                value={`${deal.plCurr} ${fmtNum(deal.plAmt)} - the rate difference locked in between this deal's two offsetting FX legs`}
              />
              <DetailCell
                label="Settlement Date"
                value={`${fmtDate(deal.valueDate)} - invoices and the linked FX Deal always settle on the same day`}
              />
            </>
          ) : null}
        </div>

        <div className="section-label">Invoice legs (one per leg of the Entity String)</div>
        <div className="table-wrap">
          <table className="list-table">
            <thead>
              <tr>
                <th className="left">Leg</th>
                <th className="left">Seller</th>
                <th className="left">Buyer</th>
                <th className="left">Invoice Currency</th>
                <th>Invoice Amount</th>
                <th>Markup vs. Prior Leg</th>
                <th className="left">Settlement Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.leg}>
                  <td className="left">{r.leg}</td>
                  <td className="left">{r.seller}</td>
                  <td className="left">{r.buyer}</td>
                  <td className="left">{r.curr}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(r.amt)}</td>
                  <td style={{ textAlign: 'right' }}>{r.markup === null ? '—' : `+${fmtNum(r.markup)}`}</td>
                  <td className="left">{deal ? fmtDate(deal.valueDate) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">
          {deal ? (
            <>
              <strong>Note:</strong> One invoice is generated per leg of the Entity String once the Bill of Lading is
              attached to this Deal ID - {rows.length} legs here ({rows.map((r) => r.leg).join(', ')}). The small markup
              added at each onward leg is the trade markup profit baked into the invoice chain; it is separate from, and
              in addition to, the FX spread profit shown above.
            </>
          ) : null}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-cancel" onClick={modal.close}>
          Close
        </button>
      </div>
    </Overlay>
  )
}
