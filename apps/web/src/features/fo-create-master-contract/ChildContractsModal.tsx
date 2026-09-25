import { Overlay, type Modal } from './modal.tsx'
import type { ChildContract, MasterContract } from './types.ts'

export function ChildContractsModal({
  modal,
  parent,
  items,
}: {
  modal: Modal
  parent: MasterContract | undefined
  items: ChildContract[]
}) {
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable child-contract-modal">
        <div className="modal-head-row">
          <h2>{parent ? `Child Contracts — ${parent.mcNumber}` : 'Child Contracts'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll">
          {parent ? (
            <>
              <div className="child-parent-summary">
                Parent MC: <b>{parent.mcNumber}</b> &nbsp;|&nbsp; Origin: <b>{parent.originEntity}</b> &nbsp;|&nbsp; FX Model:{' '}
                <b>{parent.fxModelCode}</b>
              </div>
              <div className="popup-table-wrap">
                <table className="popup-table" style={{ minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th>Child Type</th>
                      <th>Child Contract No</th>
                      <th>Child Ref</th>
                      <th>Description</th>
                      <th>Sell</th>
                      <th>Buy</th>
                      <th>Side</th>
                      <th>Trade Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ch) => (
                      <tr key={ch.childType}>
                        <td>
                          <b>{ch.childType}</b>
                        </td>
                        <td className="mono">{ch.childContractNo}</td>
                        <td className="mono">{ch.childReference}</td>
                        <td>{ch.description}</td>
                        <td>{ch.sellEntity}</td>
                        <td>{ch.buyEntity}</td>
                        <td>
                          {ch.side} ({ch.sideCode})
                        </td>
                        <td>{ch.tradeType}</td>
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
