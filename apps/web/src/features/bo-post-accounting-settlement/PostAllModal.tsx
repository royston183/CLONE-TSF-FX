import { fmtMoney } from './format.ts'
import { ModalShell } from './modal.tsx'
import type { InvLeg } from './types.ts'

/** Modal 9004: Trade Invoice, Posting All. `pending` is the legs it will raise a document for. */
export function PostAllModal({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean
  pending: InvLeg[]
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ModalShell
      open={open}
      size="wide"
      icon={'📥'}
      title="Trade Invoice: Posting All"
      subtitle="Bulk-post every ready, unposted invoice leg for this Deal ID"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" onClick={onConfirm}>
            Posting All
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 10 }}>
        {pending.length} invoice leg(s) are checked for FI Posting and have no document yet. Posting All will raise
        one accounting document per leg.
      </p>
      <table className="mini-table">
        <thead>
          <tr>
            <th className="left">D/C</th>
            <th className="left">Account</th>
            <th className="left">Trade Type</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {pending.flatMap((r) => [
            <tr key={`${r.tType}-dr`}>
              <td className="left dc-dr">Debit</td>
              <td className="left">{r.buy} · Trade Receivable</td>
              <td className="left">{r.tradeType}</td>
              <td className="num">{fmtMoney(r.invCurr, r.invAmt)}</td>
            </tr>,
            <tr key={`${r.tType}-cr`}>
              <td className="left dc-cr">Credit</td>
              <td className="left">{r.sell} · Trade Revenue</td>
              <td className="left">{r.tradeType}</td>
              <td className="num">{fmtMoney(r.invCurr, r.invAmt)}</td>
            </tr>,
          ])}
        </tbody>
      </table>
    </ModalShell>
  )
}
