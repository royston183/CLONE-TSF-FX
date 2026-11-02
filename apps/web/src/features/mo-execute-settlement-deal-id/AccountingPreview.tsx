import { useEffect, useState } from 'react'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { livePorts, loadFxEntries, type FxEntries } from './postedEntries.ts'
import { previewInvoiceAccounting, type AccountingPreview } from './preview.ts'
import type { FxDeal, InvPostForm, TradeInvoice } from './types.ts'

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

const FX_COLUMNS = ['D', 'CoCode', 'Document Date', 'Posting Date', 'G/L Acct', 'GL Description', 'Payment Amt', 'Pay Curr', 'Profit Center', 'Bus. Area']

type FxState = { status: 'idle' | 'loading' | 'ready' | 'error'; entries?: FxEntries; error?: string }

/** The FX transaction's posted FI documents, read whenever the pop-up opens on a leg. */
export function useFxEntries(open: boolean, row: FxDeal | undefined): FxState {
  const [state, setState] = useState<FxState>({ status: 'idle' })
  const key = row ? `${row.bukrs}|${row.rfha}` : ''
  useEffect(() => {
    if (!open || !row) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    loadFxEntries(row.bukrs, row.rfha, livePorts, controller.signal).then(
      (entries) => { if (!controller.signal.aborted) setState({ status: 'ready', entries }) },
      (error: unknown) => { if (!controller.signal.aborted && !isAbort(error)) setState({ status: 'error', error: messageOf(error) }) },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers the leg
  }, [open, key])
  return open && row ? state : { status: 'idle' }
}

export function FxAccountingTable({ title, state, side }: { title: string; state: FxState; side: 'buy' | 'sell' }) {
  const posted = state.entries?.[side] ?? null
  const empty = state.status === 'loading'
    ? 'Reading the posted entries from SAP...'
    : state.status === 'error'
      ? `The posted entries could not be read: ${state.error}`
      : posted
        ? `FI document ${posted.document} (${posted.fiscalYear}) has no items SAP could return.`
        : 'No accounting entries yet: they are posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081).'
  return (
    <div className="fbox" style={{ marginTop: '10px', marginBottom: 0 }}>
      <div className="fbox-title">{title}{posted ? ` — FI document ${posted.document}` : ''}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>{FX_COLUMNS.map((c) => <th key={c} className="left">{c}</th>)}</tr>
          </thead>
          <tbody>
            {posted?.lines.length ? posted.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.dc}</td><td>{l.coCode}</td><td>{l.documentDate}</td><td>{l.postingDate}</td><td>{l.account}</td><td>{l.description}</td>
                <td className="num">{l.amount}</td><td>{l.currency}</td><td>{l.profitCenter}</td><td>{l.businessArea}</td>
              </tr>
            )) : (
              <tr className="empty-row"><td colSpan={FX_COLUMNS.length}>{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
