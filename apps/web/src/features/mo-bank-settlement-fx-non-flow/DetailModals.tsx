import type { ReactNode } from 'react'
import { DASH, fmtDate, fmtNum, fmtRate } from './format.ts'
import { statusClass } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Deal } from './types.ts'

function Cell({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className={`detail-val${accent ? ' accent' : ''}`}>{children}</div>
    </div>
  )
}

function Leg({ side, amt, curr }: { side: Deal['bs1']; amt: number; curr: string }) {
  return (
    <>
      <span className={`leg-${side === 'BUY' ? 'buy' : 'sell'}`}>{side}</span> {fmtNum(amt)} {curr}
    </>
  )
}

/** Transaction Details (RFHA hotspot -> TB_TRANSACTION_TO_DISPLAY). */
export function TxnModal({
  modal,
  deal,
  companies,
}: {
  modal: Modal
  deal: Deal | null
  /** T001 code -> name. */
  companies: Readonly<Record<string, string>>
}) {
  const d = deal
  return (
    <Overlay id="txn-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Transaction Details</div>
            <div className="modal-subtitle" id="txn-subtitle">
              {d ? `Deal ${d.dealId} · Txn ${d.rfha} · ${d.bukrs}` : ' '}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {d ? (
            <>
              <div className="entity-flow" id="txn-legs" style={{ marginBottom: 14 }}>
                <span className="ent-chip">{d.bukrs}</span>
                <span className="arrow">→</span>
                <span className="ent-chip">{d.counterparty}</span>
              </div>
              <div className="detail-grid" id="txn-grid">
                <Cell label="Deal ID">
                  <span className="deal-id">{d.dealId}</span>
                </Cell>
                <Cell label="Deal Description">{d.dealDesc}</Cell>
                <Cell label="MC Reference No">{d.mcRef}</Cell>
                <Cell label="Transaction No (RFHA)">{d.rfha}</Cell>
                <Cell label="Company Code">
                  {d.bukrs} · {companies[d.bukrs] ?? d.bukrs}
                </Cell>
                <Cell label="Counterparty">{d.counterparty}</Cell>
                <Cell label="Trader">{d.trader}</Cell>
                <Cell label="Profit Center">{d.profitCtr || DASH}</Cell>
                <Cell label="Business Area">{d.businessArea || DASH}</Cell>
                <Cell label="Blotter Date">{fmtDate(d.blotterDate)}</Cell>
                <Cell label="Value Date">{fmtDate(d.valueDate)}</Cell>
                <Cell label="Txn Status">
                  <span className={statusClass(d.status)}>{d.status}</span>
                </Cell>
                <Cell label="Currency Pair">{d.ccyPair}</Cell>
                <Cell label="Buy / Sell Leg 1">
                  <Leg side={d.bs1} amt={d.amt1} curr={d.curr1} />
                </Cell>
                <Cell label="Buy / Sell Leg 2">
                  <Leg side={d.bs2} amt={d.amt2} curr={d.curr2} />
                </Cell>
                <Cell label="Overall Rate">{fmtRate(d.overallRate)}</Cell>
                <Cell label="NDF Date / Ref">{d.ndfDate ? `${fmtDate(d.ndfDate)} / ${d.ndfRef ?? ''}` : DASH}</Cell>
                <Cell label="NDF Rate">{d.ndfRate ? fmtRate(d.ndfRate) : DASH}</Cell>
                <Cell label="Settlement Currency">{d.settleCurr}</Cell>
                <Cell label="Settlement Amount">{fmtNum(d.settleAmt)}</Cell>
                <Cell label="Settlement Document">{d.fiDoc || DASH}</Cell>
                <Cell label="Internal Reference">{d.internalRef || DASH}</Cell>
                <Cell label="Assignment">{d.assignment || DASH}</Cell>
                <Cell label="FO Remark">{d.foRemark || DASH}</Cell>
                <Cell label="MO Remark">{d.moRemark || DASH}</Cell>
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Settlement Document (FI_DOC hotspot -> FB03). */
export function DocModal({ modal, deal }: { modal: Modal; deal: Deal | null }) {
  const d = deal
  return (
    <Overlay id="doc-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Settlement Document</div>
            <div className="modal-subtitle">Display document (FB03)</div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {d && d.fiDoc ? (
            <div className="detail-grid" id="doc-grid">
              <Cell label="Document No." accent>
                {d.fiDoc}
              </Cell>
              <Cell label="Company Code">{d.bukrs}</Cell>
              <Cell label="Fiscal Year">{d.valueDate.substring(0, 4)}</Cell>
              <Cell label="Posting Date">{fmtDate(d.valueDate)}</Cell>
              <Cell label="Currency">{d.settleCurr}</Cell>
              <Cell label="Amount">{fmtNum(d.settleAmt)}</Cell>
              <Cell label="Reference (Txn No)">{d.rfha}</Cell>
              <Cell label="Companion Document">{d.doc2 && d.doc2 !== d.fiDoc ? d.doc2 : DASH}</Cell>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
