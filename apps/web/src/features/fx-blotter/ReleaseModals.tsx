import { txnTypeOf } from './data.ts'
import { fmtDate, fmtNum } from './format.ts'
import { bsText, mcBalance } from './logic.ts'
import { CheckBox, DetailGrid, ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { BlotterRow, Check, DealRecord, MasterContract } from './types.ts'

const EMPTY_CELL = { textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: 14 } as const

/** Release to MO with one leg: join an open Deal ID (screens 9004 / 9005). */
export function AssignModal({
  modals,
  row,
  deals,
  selected,
  check,
  onSelect,
  onConfirm,
}: {
  modals: ModalStack
  row: BlotterRow | undefined
  deals: DealRecord[]
  selected: string | null
  check: Check | null
  onSelect: (dealId: string) => void
  onConfirm: () => void
}) {
  const close = () => modals.close('assign')
  const tt = row ? txnTypeOf(row.txnType) : null
  return (
    <Overlay id="assign" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <ModalHeader
          title="Assign to Existing Deal ID"
          subtitle={row ? `${row.transactionNumber} – ${row.txnType} ${row.curr1}/${row.curr2}` : ''}
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Selected Transaction</div>
          <DetailGrid
            pairs={
              row
                ? [
                    ['RFHA', row.transactionNumber],
                    ['Entity', row.entity],
                    ['Type', row.txnType + (tt?.ndf ? ' (NDF)' : '')],
                    ['Buy/Sell', row.buySell],
                    ['Amount 1', `${row.curr1} ${fmtNum(row.amt1)}`],
                    ['Value Date', fmtDate(row.valueDate)],
                  ]
                : []
            }
          />
          <div className="section-label">Open Deal IDs (Spot / TOM / Forward settlement)</div>
          <div className="table-wrap">
            <table className="mini-table" id="assign-dealid-table">
              <thead>
                <tr>
                  <th />
                  <th>Deal ID</th>
                  <th>MC</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Legs</th>
                </tr>
              </thead>
              <tbody>
                {deals.length ? (
                  deals.map((d) => (
                    <tr
                      key={d.dealId}
                      className={selected === d.dealId ? 'selectable mc-selected' : 'selectable'}
                      data-dealid={d.dealId}
                      onClick={() => onSelect(d.dealId)}
                    >
                      <td>
                        <input
                          type="radio"
                          name="assign-deal"
                          checked={selected === d.dealId}
                          onChange={() => onSelect(d.dealId)}
                        />
                      </td>
                      <td className="deal-id">{d.dealId}</td>
                      <td>{d.mcNumber}</td>
                      <td>{d.model}</td>
                      <td>{d.type}</td>
                      <td>{d.legs.length}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={EMPTY_CELL}>
                      No open Deal IDs yet. Select two matching legs instead to create a new Deal ID via Master Contract
                      assignment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div id="assign-validation">
            {check ? (
              <CheckBox check={check} okText="Deal ID compatibility check passed." heading="Cannot assign:" />
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="assign-confirm-btn"
            disabled={!check?.ok}
            onClick={onConfirm}
          >
            Assign &amp; Release
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Release to MO with two legs: pick a Master Contract and generate a new Deal ID (screen 9003). */
export function McAssignModal({
  modals,
  legs,
  pair,
  candidates,
  selected,
  tolerance,
  onSelect,
  onConfirm,
}: {
  modals: ModalStack
  legs: BlotterRow[]
  pair: Check | null
  candidates: MasterContract[]
  selected: MasterContract | undefined
  tolerance: Check | null
  onSelect: (mcNumber: string) => void
  onConfirm: () => void
}) {
  const close = () => modals.close('mc')
  const d1 = legs[0]
  return (
    <Overlay id="mc" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 760 }}>
        <ModalHeader
          title="Master Contract Assignment & New Deal ID"
          subtitle={legs.map((r) => r.transactionNumber).join(' + ')}
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Selected D1 / D2 Legs</div>
          <div className="table-wrap">
            <table className="mini-table" id="mc-legs-table">
              <thead>
                <tr>
                  <th>Leg</th>
                  <th>RFHA</th>
                  <th>Entity</th>
                  <th>B/S</th>
                  <th>Curr1</th>
                  <th>Amount1</th>
                  <th>Rate</th>
                  <th>Value Date</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((r, i) => (
                  <tr key={r.id}>
                    <td>D{i + 1}</td>
                    <td>{r.transactionNumber}</td>
                    <td>{r.entity}</td>
                    <td>{bsText(r.buySell)}</td>
                    <td>{r.curr1}</td>
                    <td className="num">{fmtNum(r.amt1)}</td>
                    <td className="num">{fmtNum(r.totalRate, 4)}</td>
                    <td>{fmtDate(r.valueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div id="mc-pair-validation">
            {pair ? (
              <CheckBox
                check={pair}
                okText="D1/D2 pair matching passed: opposite sides, same currency pair, value dates within tolerance."
                heading="Pair mismatch:"
              />
            ) : null}
          </div>
          <div className="section-label">Eligible Master Contracts (matching FX Model &amp; Entity)</div>
          <div className="table-wrap">
            <table className="mini-table" id="mc-candidates-table">
              <thead>
                <tr>
                  <th />
                  <th>MC</th>
                  <th>Model</th>
                  <th>Entity String</th>
                  <th>Ship Window</th>
                  <th>Balance (USD)</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length ? (
                  candidates.map((mc) => {
                    const on = selected?.mcNumber === mc.mcNumber
                    return (
                      <tr
                        key={mc.mcNumber}
                        className={on ? 'selectable mc-selected' : 'selectable'}
                        data-mc={mc.mcNumber}
                        onClick={() => onSelect(mc.mcNumber)}
                      >
                        <td>
                          <input type="radio" name="mc-cand" checked={on} onChange={() => onSelect(mc.mcNumber)} />
                        </td>
                        <td>{mc.mcNumber}</td>
                        <td>
                          {mc.fxModel} - {mc.modelDesc}
                        </td>
                        <td>{mc.entities.join('-')}</td>
                        <td>
                          {fmtDate(mc.shipStart)} – {fmtDate(mc.shipEnd)}
                        </td>
                        <td className="num">{fmtNum(mcBalance(mc))}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={EMPTY_CELL}>
                      No Master Contract matches this currency pair and origin entity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div id="mc-tolerance-validation">
            {tolerance && selected && d1 ? (
              <CheckBox
                check={tolerance}
                okText={`Tolerance check passed. Remaining balance after this deal: USD ${fmtNum(mcBalance(selected) - (d1.amt1 || 0))}.`}
                heading="Cannot proceed:"
              />
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="mc-confirm-btn"
            disabled={!tolerance?.ok}
            onClick={onConfirm}
          >
            Generate Deal ID &amp; Release
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Release to MO - SS: both legs under one Short Straddle Deal ID (screen 9007). */
export function ShortStraddleModal({
  modals,
  legs,
  eligible,
  noInvoice,
  onNoInvoice,
  onConfirm,
}: {
  modals: ModalStack
  legs: BlotterRow[]
  eligible: boolean
  noInvoice: boolean
  onNoInvoice: (on: boolean) => void
  onConfirm: () => void
}) {
  const close = () => modals.close('ss')
  return (
    <Overlay id="ss" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <ModalHeader
          title="Short Straddle Release"
          subtitle={legs.map((r) => r.transactionNumber).join(' + ')}
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Selected Transactions</div>
          <div className="table-wrap">
            <table className="mini-table" id="ss-legs-table">
              <thead>
                <tr>
                  <th>RFHA</th>
                  <th>Entity</th>
                  <th>B/S</th>
                  <th>Curr1</th>
                  <th>Amount1</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.transactionNumber}</td>
                    <td>{r.entity}</td>
                    <td>{bsText(r.buySell)}</td>
                    <td>{r.curr1}</td>
                    <td className="num">{fmtNum(r.amt1)}</td>
                    <td>{r.fxModel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-field span3" style={{ marginTop: 10 }}>
            <label>
              <input
                type="checkbox"
                id="ss-no-invoice"
                style={{ width: 'auto', height: 'auto', marginRight: 6 }}
                checked={noInvoice}
                onChange={(e) => onNoInvoice(e.target.checked)}
              />
              No-Invoice model (SS Deal ID only, skip trade invoicing linkage)
            </label>
          </div>
          <div id="ss-validation">
            <div className={`validation-box ${eligible ? 'ok' : 'warn'}`}>
              {eligible
                ? 'Both legs are booked under a Short Straddle-eligible model.'
                : 'Selected legs are not booked under a Short Straddle-eligible model; assignment will still proceed for this demo.'}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" id="ss-confirm-btn" onClick={onConfirm}>
            Assign SS Deal ID &amp; Release
          </button>
        </div>
      </div>
    </Overlay>
  )
}
