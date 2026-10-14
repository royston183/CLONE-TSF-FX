import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Button, Dialog } from '@slc/ui'
import { loadLinkedDeals, messageOf, type DealRow } from '../fx/master-contract.ts'
import { txt } from '../fx/masters.ts'
import { isAbort } from '../fx/mw.ts'
import { dmyFromIso } from '../fx/sap.ts'
import './linked-deals.css'

/** Master Contract -> linked Deal IDs -> Analysis / Settlement, as in the SAP manager. */
export function LinkedDealsModal({ open, onClose, mcNumber }: { open: boolean; onClose: () => void; mcNumber: number | null }) {
  const [rows, setRows] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!open || mcNumber === null) return
    const ctrl = new AbortController()
    setRows([])
    setError('')
    setLoading(true)
    void loadLinkedDeals(mcNumber, ctrl.signal)
      .then((deals) => {
        if (!ctrl.signal.aborted) setRows(deals)
      })
      .catch((reason: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(reason)) setError(`The linked Deal IDs could not be read: ${messageOf(reason)}`)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [open, mcNumber, generation])

  if (typeof document === 'undefined') return null
  return createPortal(
    <Dialog open={open} onClose={onClose} title={`Linked Deal IDs — Master Contract ${mcNumber ?? ''}`} width={1040}
      footer={<Button onClick={onClose}>Close</Button>}>
        <div className="mc-linked-deals">
          {loading ? <p role="status">Loading linked Deal IDs…</p> : error ? (
            <div role="alert">
              <p>{error}</p>
              <Button onClick={() => setGeneration((g) => g + 1)}>Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <p>No Deal IDs are linked to this master contract.</p>
          ) : (
            <div className="mc-linked-deals__scroll">
              <table className="mc-linked-deals__table">
                <thead><tr><th>Deal ID</th><th>Description</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const id = txt(row, 'ZDEAL_ID')
                    const query = `?dealId=${encodeURIComponent(id)}`
                    return (
                      <tr key={`${id}|${txt(row, 'ZDEAL_TYPE')}|${txt(row, 'ZSUB_TYPE')}`}>
                        <td><Link to={`/apps/mo-confirm-fx-deal-id${query}`}>{id}</Link></td>
                        <td>{txt(row, 'ZDEAL_DESC') || '—'}</td>
                        <td>{txt(row, 'ZDEAL_STAT') || '—'}</td>
                        <td>{dmyFromIso(txt(row, 'ZS_DATE')) || '—'}</td>
                        <td>{dmyFromIso(txt(row, 'ZE_DATE')) || '—'}</td>
                        <td className="mc-linked-deals__actions">
                          <Link className="slc-btn slc-btn--default" to={`/apps/mo-confirm-fx-deal-id${query}`}>Confirmation / Analysis</Link>{' '}
                          <Link className="slc-btn slc-btn--default" to={`/apps/mo-execute-settlement-deal-id${query}`}>Execute Settlement</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </Dialog>,
    document.body,
  )
}
