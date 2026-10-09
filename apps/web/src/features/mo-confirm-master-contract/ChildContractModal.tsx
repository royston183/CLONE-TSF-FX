import { Fragment, type ReactNode } from 'react'
import { StatusCell } from './ContractsTable.tsx'
import { STATUS } from './data.ts'
import { fmtDate, fmtDateTime, fmtNum } from './format.ts'
import { buildChildLegs, isActionable } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract, McAction } from './types.ts'

/** MC: View Child Contract List — the breakdown opened from an MC Number link. */
export function ChildContractModal({
  modal,
  mc,
  onQuickAction,
}: {
  modal: Modal
  /** The contract as it was when the modal opened, like the page's one-off render. */
  mc: MasterContract | null
  onQuickAction: (action: McAction, mc: MasterContract) => void
}) {
  return (
    <Overlay id="child-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div className="modal-icon">◫</div>
          <div className="modal-header-text">
            <div className="modal-title">MC: View Child Contract List</div>
            <div className="modal-subtitle" id="child-subtitle">
              {mc ? `MC ${mc.mcNumber} – ${mc.mcDescription}` : null}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{mc ? <ChildBody mc={mc} /> : null}</div>
        <div className="modal-footer child-modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Close
          </button>
          <div id="child-quick-actions" className="child-quick-actions">
            {mc && isActionable(mc) ? (
              <>
                <button className="common-btn approve" type="button" onClick={() => onQuickAction('confirm', mc)}>
                  Confirm this MC
                </button>
                <button className="common-btn reject" type="button" onClick={() => onQuickAction('reject', mc)}>
                  Reject this MC
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

function Cell({ label, children, accent = false }: { label: string; children: ReactNode; accent?: boolean }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className={`detail-val${accent ? ' accent' : ''}`}>{children}</div>
    </div>
  )
}

function ChildBody({ mc }: { mc: MasterContract }) {
  const legs = buildChildLegs(mc)
  return (
    <>
      <div className="detail-grid" id="child-detail-grid">
        <Cell label="Master Contract" accent>
          {mc.mcNumber}
        </Cell>
        <Cell label="Status">
          <StatusCell status={mc.status} />
        </Cell>
        <Cell label="Created MC">{mc.mcReference}</Cell>
        <Cell label="Entity ID">{mc.entityId}</Cell>
        <Cell label="Contract Amt">
          USD {fmtNum(mc.amtUSD)} / {mc.currOrigin} {fmtNum(mc.amtOrigin)}
        </Cell>
        <Cell label="Exchange Rate">{mc.exRate.toFixed(4)}</Cell>
        <Cell label="Commodity">
          {mc.commodityCode} - {mc.commodityDesc}
        </Cell>
        <Cell label="MC Date">{fmtDate(mc.mcDate)}</Cell>
        <Cell label="Ship Window">
          {fmtDate(mc.shipStart)} – {fmtDate(mc.shipEnd)}
        </Cell>
        <Cell label="Currency String">{mc.currChain.join('-')}</Cell>
        <Cell label="Payment Terms">
          {mc.paymentTerms} – due {fmtDate(mc.paymentDate)}
        </Cell>
        <Cell label="Ports">
          {mc.portOfShipment} → {mc.portOfDestination}
        </Cell>
        <Cell label="Entered By / On">
          {mc.enteredBy}, {fmtDateTime(mc.enteredOn, mc.entryTime)}
        </Cell>
        <Cell label="Changed By / On">
          {mc.changedBy && mc.changedOn ? (
            `${mc.changedBy}, ${fmtDate(mc.changedOn)}`
          ) : (
            <span className="muted-dash">– not yet changed</span>
          )}
        </Cell>
        {mc.moRemarks ? (
          <div className="detail-cell">
            <div className="detail-lbl">MO Remarks</div>
            <div className="detail-val" style={{ color: 'var(--red)' }}>
              {mc.moRemarks}
            </div>
          </div>
        ) : null}
      </div>

      <div className="section-label">Entity String Flow</div>
      <div className="entity-flow" id="child-entity-flow">
        {mc.entities.map((e, i) => (
          <Fragment key={`${e}-${i}`}>
            {i > 0 ? <span className="arrow">→</span> : null}
            <span className="ent-chip">{e}</span>
          </Fragment>
        ))}
      </div>

      <div className="section-label">Child Contracts (Trade Legs)</div>
      <div className="table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <th className="left">Trade Type</th>
              <th className="left">Seller</th>
              <th className="left">Buyer</th>
              <th className="left">MC Child Ref.</th>
              <th className="left">P/S</th>
              <th className="left">MC Description</th>
              <th>MC Amount(USD)</th>
              <th>Bal Amt(USD)</th>
              <th>Planned Inv Amt</th>
              <th className="left">Inv Curr</th>
            </tr>
          </thead>
          <tbody id="child-tbody">
            {legs.map((r) => (
              <tr key={`${r.t}-${r.ps}`}>
                <td className="left">{r.t}</td>
                <td className="left">{r.seller}</td>
                <td className="left">{r.buyer}</td>
                <td className="left">{r.ref}</td>
                <td className="left">{r.ps}</td>
                <td className="left">{r.desc}</td>
                <td className="num">{fmtNum(r.amt)}</td>
                <td className="num">{fmtNum(r.bal)}</td>
                <td className="num">{r.planned ? fmtNum(r.planned) : <span className="muted-dash">not yet raised</span>}</td>
                <td className="left">{r.curr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note" id="child-note">
        {mc.status === STATUS.INUSE ? (
          <>
            <strong>Note:</strong> This MC already has Deal ID <span className="deal-id">{mc.dealId}</span> assigned, so planned
            invoice amounts are populated per leg.
          </>
        ) : (
          <>
            <strong>Note:</strong> No FX Deal has been booked against this MC yet, so planned invoice amounts are not yet raised.
          </>
        )}
      </div>
    </>
  )
}
