import { useEffect, useState } from 'react'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { previewInvoiceAccounting, type AccountingPreview } from './preview.ts'
import type { InvPostForm, TradeInvoice } from './types.ts'

const COLUMNS = ['D', 'Posting Date', 'Document Date', 'G/L Acc', 'Vendor', 'Profit Ctr', 'Bus. Area', 'House Bank', 'Acct ID', 'Invoice Am', 'Invoice Cu', 'Payment Am', 'Pay Curr', 'Account', 'Account Type']

type State = { status: 'idle' | 'loading' | 'ready' | 'error'; preview?: AccountingPreview; error?: string }

/** The pop-up's lines, worked out again whenever the leg or the chosen banks change (the bank decides the G/L). */
function useAccountingPreview(open: boolean, row: TradeInvoice | undefined, form: InvPostForm, dealId: string): State {
  const [state, setState] = useState<State>({ status: 'idle' })
  const key = JSON.stringify([row?.leg, form.senderHouseBank, form.senderAccountId, form.receiverHouseBank, form.receiverAccountId, dealId])
  useEffect(() => {
    if (!open || !row) return
    let cancelled = false
    setState((s) => ({ status: 'loading', ...(s.preview ? { preview: s.preview } : {}) }))
    const timer = setTimeout(() => {
      previewInvoiceAccounting(row, form, dealId).then(
        (preview) => { if (!cancelled) setState({ status: 'ready', preview }) },
        (error: unknown) => { if (!cancelled) setState({ status: 'error', error: messageOf(error) }) },
      )
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers every input the preview reads
  }, [open, key])
  return open && row ? state : { status: 'idle' }
}

export function InvoiceAccountingTable({ open, row, form, dealId }: { open: boolean; row: TradeInvoice | undefined; form: InvPostForm; dealId: string }) {
  const { status, preview, error } = useAccountingPreview(open, row, form, dealId)
  const lines = preview?.lines ?? []
  return (
    <div className="fbox" style={{ marginTop: '10px', marginBottom: 0 }}>
      <div className="fbox-title">Accounting Entry{form.fiDoc ? ` — FI document ${form.fiDoc}` : ' — preview, posted on BO'}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>{COLUMNS.map((c) => <th key={c} className="left">{c}</th>)}</tr>
          </thead>
          <tbody>
            {lines.length ? lines.map((l) => (
              <tr key={l.dc}>
                <td>{l.dc}</td><td>{l.postingDate}</td><td>{l.documentDate}</td><td>{l.glAccount}</td><td>{l.vendor}</td><td>{l.profitCenter}</td><td>{l.businessArea}</td>
                <td>{l.houseBank}</td><td>{l.accountId}</td><td className="num">{l.invoiceAmount}</td><td>{l.invoiceCurrency}</td><td className="num">{l.paymentAmount}</td><td>{l.payCurrency}</td>
                <td>{l.account}</td><td>{l.accountType}</td>
              </tr>
            )) : (
              <tr className="empty-row">
                <td colSpan={COLUMNS.length}>{status === 'loading' ? 'Working out the accounting entry...' : status === 'error' ? `The accounting entry could not be worked out: ${error}` : 'No accounting entry: this leg has no posting type.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {preview?.issues.length ? <div className="ffield" role="status" style={{ marginTop: '6px' }}>{preview.issues.map((i) => <small key={i}>{i}</small>)}</div> : null}
    </div>
  )
}
