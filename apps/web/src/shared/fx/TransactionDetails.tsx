import { useEffect, useId, useState } from 'react'
import { Button, Dialog } from '@slc/ui'
import { loadTransactionDetails, transactionSections, type DetailField, type TransactionDetails } from './transaction-details.ts'
import './transaction-details.css'

function Fields({ fields }: { fields: DetailField[] }) {
  return <dl className="txn-detail-fields">{fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value || <span className="txn-detail-blank" aria-label="Not available">—</span>}</dd></div>)}</dl>
}

export function useTransactionDetails(bukrs: string, rfha: string) {
  const [result, setResult] = useState<TransactionDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setResult(null)
    void loadTransactionDetails({ CompanyCode: bukrs, FinancialTransaction: rfha }, controller.signal)
      .then((d) => { if (!controller.signal.aborted) setResult(d) })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Transaction details could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [bukrs, rfha, attempt])
  return { result, loading, error, refresh: () => setAttempt((n) => n + 1) }
}

type DetailState = ReturnType<typeof useTransactionDetails>

export function TransactionDetailsBody({ state, companyName = '' }: { state: DetailState; companyName?: string }) {
  const { result, loading, error, refresh } = state
  const [tab, setTab] = useState<'structure' | 'administration'>('structure')
  const id = useId()
  const details = result ? transactionSections(result, companyName) : null
  const tabs = ['structure', 'administration'] as const
  return (
    <div className="fx-transaction-details txn-detail-content" aria-busy={loading}>
      {loading ? <div className="txn-detail-message" role="status">Loading transaction details…</div> : null}
      {error ? <div className="txn-detail-message txn-detail-error" role="alert"><p>{error}</p><button type="button" className="slc-btn slc-btn--default" onClick={() => refresh()}>Retry</button></div> : null}
      {details && result ? <>
        <div className="txn-detail-header"><Fields fields={details.header} /></div>
        {result.warnings.length ? <p className="txn-detail-note" role="status">{result.warnings.join(' ')} You can refresh to try again.</p> : null}
        <div className="txn-detail-tabs" role="tablist" aria-label="Transaction details">{tabs.map((key, i) => <button type="button" key={key} role="tab" id={`${id}-${key}-tab`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault()
            const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[1] : tabs[1 - i]!
            setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus()
          }
        }}>{key === 'structure' ? 'Structure' : 'Administration'}</button>)}</div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}-tab`} tabIndex={0}>
          {details[tab].map((s) => <section className="txn-detail-section" key={s.title} aria-label={s.title}><h3>{s.title}</h3><Fields fields={s.fields} /></section>)}
        </div>
        <p className="txn-detail-note">— Value unavailable or not supplied for this transaction.</p>
      </> : null}
    </div>
  )
}

/** Read-only display for transaction hotspots outside the workbench popup stack. */
export function TransactionDetailsDialog({ bukrs, rfha, onClose }: { bukrs: string; rfha: string; onClose: () => void }) {
  const state = useTransactionDetails(bukrs, rfha)
  return <div className="fx-transaction-dialog"><Dialog open title={`Transaction ${rfha} / ${bukrs}`} width={960} onClose={onClose} footer={<>
    <Button disabled={state.loading} onClick={state.refresh}>Refresh details</Button>
    <Button onClick={onClose}>Close</Button>
  </>}>
    <TransactionDetailsBody state={state} />
  </Dialog></div>
}
