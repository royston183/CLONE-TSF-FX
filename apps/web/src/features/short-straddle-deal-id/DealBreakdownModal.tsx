import { CANCELLED_DEAL_STATUS, DEAL_STATUS_CLASS, DEAL_STATUS_MASTER } from './data.ts'
import { fmtDate, fmtNum } from './format.ts'
import { computeAmounts, dealsForMc } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { Deal, MasterContract } from './types.ts'

/** Hotspot on Uti-Deal ID Amt(USD) — SUBMIT ZSGTSF_RDEAL_ID_DETAIL. */
export function DealBreakdownModal({
  open,
  contract: mc,
  deals: allDeals,
  onClose,
}: {
  open: boolean
  contract: MasterContract | undefined
  deals: Deal[]
  onClose: () => void
}) {
  const a = mc ? computeAmounts(mc, allDeals) : null
  const deals = mc ? dealsForMc(allDeals, mc.mcRef) : []
  return (
    <Overlay id="dealbreak-overlay" open={open} onClose={onClose}>
      <div className="modal-card" style={{ maxWidth: 820 }}>
        <ModalHeader title="Deal ID / FX Leg Breakdown" subtitle={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : ''} onClose={onClose} />
        <div className="modal-body">
          <div className="detail-grid">
            {mc && a ? (
              <>
                <DetailCell label="MC Amount (USD)" value={fmtNum(mc.amtUSD)} />
                <DetailCell label="Utilized (Deal ID) Amt" value={fmtNum(a.uti)} accent />
                <DetailCell label="Balance Amt" value={fmtNum(a.bal)} />
                <DetailCell label="Deal IDs Booked" value={deals.length} />
              </>
            ) : null}
          </div>
          <div className="section-label">Deal IDs booked against this Master Contract</div>
          <table className="deal-mini-table" id="dealbreak-table">
            <thead>
              <tr>
                <th>Deal ID</th>
                <th>Deal Description</th>
                <th>Deal Status</th>
                <th>Curr1 / Curr2</th>
                <th>Amt1 (USD leg)</th>
                <th>Amt2 (Origin leg)</th>
                <th>Value Dates</th>
              </tr>
            </thead>
            <tbody>
              {mc && !deals.length ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: 18 }}
                  >
                    No Deal ID has been booked against this Master Contract yet.
                  </td>
                </tr>
              ) : (
                deals.map((d) => (
                  <tr key={d.dealId} className={d.dealStat === CANCELLED_DEAL_STATUS ? 'excluded' : ''}>
                    <td className="deal-id">{d.dealId}</td>
                    <td>{d.dealDesc}</td>
                    <td>
                      <span className={`status-chip ${DEAL_STATUS_CLASS[d.dealStat]}`}>
                        {d.dealStat} - {DEAL_STATUS_MASTER[d.dealStat]}
                      </span>
                    </td>
                    <td>
                      {d.curr1} / {d.curr2}
                    </td>
                    <td>{fmtNum(d.amt1)}</td>
                    <td>{fmtNum(d.amt2)}</td>
                    <td>
                      {fmtDate(d.sDate)} – {fmtDate(d.eDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="note">
            <strong>Note:</strong> Deal IDs with status <b>30 - Cancelled</b> are struck through and excluded from the
            Utilized Amt, matching the ABAP filter <code>WHERE b~zdeal_stat &lt;&gt; c_30</code>. This mirrors drilling
            into <code>SUBMIT ZSGTSF_RDEAL_ID_DETAIL</code> from the hotspot on <b>Uti-Deal ID Amt(USD)</b>.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
