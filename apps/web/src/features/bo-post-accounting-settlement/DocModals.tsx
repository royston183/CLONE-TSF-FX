import type { ReactNode } from 'react'
import { fiscalYear, fmtMoney } from './format.ts'
import { ModalShell, StaticField } from './modal.tsx'
import type { Deal, DocPreview } from './types.ts'

/** The FB03 / TR hotspot preview and the View Trade Invoice report share one popup. */
export function DocPreviewModal({
  open,
  preview,
  deal,
  onClose,
}: {
  open: boolean
  preview: DocPreview | null
  deal: Deal | null
  onClose: () => void
}) {
  let title = 'Document Display'
  let subtitle = 'External transaction preview'
  let body: ReactNode = null

  if (preview?.kind === 'TXN') {
    title = 'FX Transaction Display'
    subtitle = 'Would open the Treasury transaction display (TBxx) for this deal'
    body = (
      <>
        <div className="field-grid">
          <StaticField label="Company Code">{preview.entity}</StaticField>
          <StaticField label="Transaction No">{preview.docNo}</StaticField>
        </div>
        <p className="hint">
          This hotspot calls function module <b>TB_TRANSACTION_TO_DISPLAY</b> in the real system, opening the Treasury
          &amp; Risk transaction screen. Not reproduced in this demo.
        </p>
      </>
    )
  } else if (preview?.kind === 'FI') {
    title = 'Accounting Document Display'
    subtitle = 'Would open transaction FB03 for this document'
    body = (
      <>
        <div className="field-grid">
          <StaticField label="Company Code">{preview.entity}</StaticField>
          <StaticField label="Document No">{preview.docNo}</StaticField>
          <StaticField label="Fiscal Year">{deal ? fiscalYear(deal.mcDate) : ''}</StaticField>
          <StaticField label="Posted By">Back Office</StaticField>
        </div>
        <p className="hint">
          This hotspot calls <b>CALL TRANSACTION &#39;FB03&#39;</b> in the real system, opening the standard FI
          document display. Not reproduced in this demo.
        </p>
      </>
    )
  } else if (preview?.kind === 'REPORT' && deal) {
    title = 'Trade Invoice Report'
    subtitle = `Deal ID ${deal.dealId} · opens in a separate report in the full SAP system`
    body = (
      <>
        <p className="hint" style={{ marginBottom: 12 }}>
          In the real transaction, <b>View Trade Invoice</b> submits report <b>ZSGTSF_RDEAL_ID_INV</b> and returns
          here. A read-only preview of the invoice legs is shown below.
        </p>
        <table className="mini-table">
          <thead>
            <tr>
              <th className="left">Trade Type</th>
              <th className="left">Settlement Desc</th>
              <th className="num">Invoice Amount</th>
              <th className="left">FI Document</th>
            </tr>
          </thead>
          <tbody>
            {deal.inv.map((r) => (
              <tr key={r.tType}>
                <td className="left">{r.tradeType}</td>
                <td className="left">{r.setDesc}</td>
                <td className="num">{fmtMoney(r.invCurr, r.invAmt)}</td>
                <td className="left">{r.fiDoc || <span className="doc-link-pending">not posted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <ModalShell
      open={open}
      size="narrow"
      icon={'🔍'}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <button type="button" className="btn-cancel" onClick={onClose}>
          Close
        </button>
      }
    >
      {body}
    </ModalShell>
  )
}
