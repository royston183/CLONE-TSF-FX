import { formatAmount, formatRate } from './format.ts'
import { childListRows } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { ChildContract, MasterContract } from './types.ts'

/** SAP's "MC: View Child Contract List", in the Master Contract pop-up: the parent's header, then its child contracts by trade type. */
export function ChildContractsModal({
  modal,
  parent,
  items,
}: {
  modal: Modal
  parent: MasterContract | undefined
  items: ChildContract[]
}) {
  const rows = parent ? childListRows(parent, items) : []
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable child-contract-modal">
        <div className="modal-head-row">
          <h2>MC: View Child Contract List</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll">
          {parent ? (
            <>
              <div className="child-sap-head">
                <div><span>Master Contract</span><b>{parent.mcNumber}</b></div>
                <div>
                  <span>Contract Amt</span>
                  <b>
                    USD {formatAmount(parent.mcAmountUsd)}
                    {parent.originCurrency && parent.originCurrency !== 'USD' ? ` / ${parent.originCurrency} ${formatAmount(parent.mcAmountOrigin)}` : ''} / Ex Rate: {formatRate(parent.exchangeRate)}
                  </b>
                </div>
                <div><span>Commodity</span><b>{[parent.commodityCode, parent.commodityName].filter(Boolean).join(' - ')}</b></div>
                <div><span>MC Date</span><b>{parent.mcDate}</b></div>
                <div><span>Entity String</span><b>{parent.entityString}</b></div>
              </div>
              <div className="popup-table-wrap">
                <table className="popup-table child-sap-table">
                  <thead>
                    <tr>
                      <th>Trade Type</th>
                      <th>Seller</th>
                      <th>Buyer</th>
                      <th>MC Child</th>
                      <th>P/S</th>
                      <th>MC Child Reference Contract No</th>
                      <th>MC Description</th>
                      <th className="num">MC Amt-USD</th>
                      <th className="num">Bal Amt(USD)</th>
                      <th className="num">Planned Inv Amt</th>
                      <th>Inv Curr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.mcChild} className={i > 0 && rows[i - 1]!.tradeType === r.tradeType ? 'same-trade' : undefined}>
                        <td>{i > 0 && rows[i - 1]!.tradeType === r.tradeType ? '' : <b>{r.tradeType}</b>}</td>
                        <td>{r.seller}</td>
                        <td>{r.buyer}</td>
                        <td>{r.mcChild}</td>
                        <td>{r.ps}</td>
                        <td className="mono">{r.referenceNo}</td>
                        <td>{r.description}</td>
                        <td className="num">{formatAmount(r.mcAmtUsd)}</td>
                        <td className="num">{formatAmount(r.balAmtUsd)}</td>
                        <td className="num">{formatAmount(r.plannedInvAmt)}</td>
                        <td>{r.invCurr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-actions child-modal-actions">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
