import { useMemo, useState } from 'react'
import { money } from './format.ts'
import { searchRows } from './logic.ts'
import type { BlRow } from './types.ts'

/** "View List of BLs": the legacy #blModal. Drag a selected BL row onto De-assign, or use the checkbox + button. */
export function BlModal({
  rows,
  onClose,
  onDeassign,
}: {
  rows: BlRow[]
  onClose: () => void
  onDeassign: (index: number) => void
}) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(-1)
  const [dropHover, setDropHover] = useState(false)

  const filtered = useMemo(
    () => searchRows(rows.map((r, index) => ({ ...r, index })), q, ['blNo', 'blDate', 'tfNo', 'tfSplit', 'vessel', 'pol', 'pod', 'commodity', 'qty', 'status', 'invType', 'invDate']),
    [rows, q],
  )

  const trySelect = (index: number) => {
    if (rows[index]?.status === 'De-assigned') return
    setSelected(index)
  }

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal lg">
        <div className="modal-head">
          <div className="modal-title">View List of BLs</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <input className="search" style={{ width: 280 }} placeholder="Search BLs..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button
              className={`action-btn danger${dropHover ? ' drop-hover' : ''}`}
              type="button"
              disabled={selected < 0}
              onClick={() => selected >= 0 && onDeassign(selected)}
              onDragOver={(e) => {
                e.preventDefault()
                setDropHover(true)
              }}
              onDragLeave={() => setDropHover(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDropHover(false)
                if (selected >= 0) onDeassign(selected)
              }}
            >
              De-assign
            </button>
          </div>
          <div className="mini-grid">
            <table>
              <thead>
                <tr>
                  <th className="select-cell">Check</th>
                  <th>BL No</th>
                  <th>BL Date</th>
                  <th>BL Lot</th>
                  <th>Trade Flow ID</th>
                  <th>TF Split</th>
                  <th>Vessel</th>
                  <th>Port of Loading</th>
                  <th>Port of Destination</th>
                  <th>Commodity</th>
                  <th className="num">Quantity</th>
                  <th>Status</th>
                  <th>Inv Type</th>
                  <th>Invoice Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const deassigned = r.status === 'De-assigned'
                  const isSelected = selected === r.index && !deassigned
                  return (
                    <tr
                      key={r.blNo}
                      draggable={!deassigned}
                      className={`${deassigned ? 'bl-locked ' : ''}${isSelected ? 'selected' : ''}`}
                      onClick={() => trySelect(r.index)}
                      onDragStart={(e) => {
                        if (deassigned) {
                          e.preventDefault()
                          return
                        }
                        setSelected(r.index)
                        e.dataTransfer.setData('text/plain', `bl:${r.index}`)
                      }}
                    >
                      <td className="select-cell">
                        <input className="row-check" type="checkbox" checked={isSelected} disabled={deassigned} title={deassigned ? 'Already de-assigned' : undefined} onChange={() => trySelect(r.index)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>{r.blNo}</td>
                      <td>{r.blDate}</td>
                      <td>{r.lot}</td>
                      <td>{r.tfNo}</td>
                      <td>{r.tfSplit}</td>
                      <td>{r.vessel}</td>
                      <td>{r.pol}</td>
                      <td>{r.pod}</td>
                      <td>{r.commodity}</td>
                      <td className="num">{money(r.qty, 2)}</td>
                      <td>
                        <span className={`status-text ${r.status === 'Invoiced' ? 'status-ok' : deassigned ? '' : 'status-info'}`}>{r.status}</span>
                      </td>
                      <td>{r.invType}</td>
                      <td>{r.invDate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="hint">Select a BL row (or checkbox) before de-assigning. Dragging a selected BL onto De-assign triggers the same workflow.</div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
