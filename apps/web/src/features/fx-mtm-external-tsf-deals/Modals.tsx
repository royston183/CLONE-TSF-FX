import type { ReactNode } from 'react'
import { formatAmount, formatRate, ymdToDmy } from './format.ts'
import { documentTotals, logSubtitle, rateDp, swapDp } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { AccountingDocument, Deal, Executed, MsgRow } from './types.ts'

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === '' || value === null || value === undefined
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{empty ? <span className="muted-dash">{'—'}</span> : value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">{title}</div>
      <div className="detail-grid">{children}</div>
    </div>
  )
}

function Head({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="modal-head-row">
      <h2 id={id}>{title}</h2>
      <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
        &times;
      </button>
    </div>
  )
}

function Actions({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-actions">
      <button className="btn btn-secondary" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

/** Message Log (screen 9000 popup, GT_MSG): one row per posting message. */
export function MessageLogModal({
  modal,
  executed,
  rows,
  dataset,
  onOpenDoc,
  onClose,
}: {
  modal: Modal
  executed: Executed
  rows: readonly MsgRow[]
  dataset: readonly Deal[]
  onOpenDoc: (docNo: string) => void
  onClose: () => void
}) {
  return (
    <Overlay modal={modal} labelledBy="logTitle">
      <div className="modal modal-left modal-scrollable log-modal">
        <Head id="logTitle" title="Message Log" onClose={onClose} />
        <div className="modal-body-scroll">
          <p className="modal-sub">{logSubtitle(executed, rows.length)}</p>
          <div className="popup-table-wrap">
            <table className="popup-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Co. Code</th>
                  <th>Deal No</th>
                  <th>Document</th>
                  <th className="num">Val Gain/Loss</th>
                  <th>Message</th>
                  <th className="num">Contract Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="popup-empty">
                      No messages.
                    </td>
                  </tr>
                ) : null}
                {rows.map((m, i) => {
                  const deal = dataset.find((r) => r.rfha === m.rfha)
                  const dp = deal ? rateDp(deal) : 4
                  return (
                    <tr key={i}>
                      <td>
                        <span className={`msg-icon ${m.ok ? 'ok' : 'err'}`} aria-hidden="true">
                          {m.ok ? '✓' : '✕'}
                        </span>
                        {m.ok ? 'Success' : 'Error'}
                      </td>
                      <td>{m.bukrs}</td>
                      <td className="mono">{m.rfha}</td>
                      <td>
                        {m.doc ? (
                          <button type="button" className="mc-link mono" title="Display document" onClick={() => onOpenDoc(m.doc)}>
                            {m.doc}
                          </button>
                        ) : null}
                      </td>
                      <td className="num mono">{formatAmount(m.diff)}</td>
                      <td>{m.ok ? m.message : <span className="msg-err">{m.message}</span>}</td>
                      <td className="num mono">{formatRate(m.cswap_rate, dp)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <Actions onClose={onClose} />
      </div>
    </Overlay>
  )
}

/** Accounting document (FB03 hotspot): header and line items, opened from MTM Doc / Rev Doc / the Message Log. */
export function DocumentModal({ modal, doc, onClose }: { modal: Modal; doc: AccountingDocument | null; onClose: () => void }) {
  const totals = doc ? documentTotals(doc.items) : { debit: 0, credit: 0 }
  return (
    <Overlay modal={modal} stacked labelledBy="docTitle">
      <div className="modal modal-left modal-scrollable doc-modal">
        <Head id="docTitle" title={doc ? `Accounting Document ${doc.docNo}` : 'Accounting Document'} onClose={onClose} />
        <div className="modal-body-scroll">
          {doc ? (
            <>
              <Section title="Header">
                <DetailItem label="Document Number" value={doc.docNo} />
                <DetailItem label="Company Code" value={doc.bukrs} />
                <DetailItem label="Fiscal Year" value={doc.year} />
                <DetailItem label="Document Type" value={doc.header.doc_type} />
                <DetailItem label="Document Date" value={ymdToDmy(doc.header.doc_date)} />
                <DetailItem label="Posting Date" value={ymdToDmy(doc.header.pstng_date)} />
                <DetailItem label="Reference" value={doc.header.ref_doc_no} />
                <DetailItem label="Header Text" value={doc.header.header_txt} />
                {doc.reversalOf ? <DetailItem label="Reversal of Document" value={doc.reversalOf} /> : null}
                {doc.reversalOf ? <DetailItem label="Reversal Reason" value={doc.reversalReason} /> : null}
              </Section>
              <div className="detail-section">
                <div className="detail-section-title">Line Items</div>
                <div className="popup-table-wrap">
                  <table className="popup-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>G/L Account</th>
                        <th>Profit Center</th>
                        <th>Bus. Area</th>
                        <th>Item Text</th>
                        <th className="num">Debit</th>
                        <th className="num">Credit</th>
                        <th>Curr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.items.map((i) => (
                        <tr key={i.itemno}>
                          <td>{i.itemno}</td>
                          <td className="mono">{i.gl_account}</td>
                          <td>{i.profit_ctr}</td>
                          <td>{i.bus_area}</td>
                          <td>{i.item_text}</td>
                          <td className="num mono">{i.amount > 0 ? formatAmount(i.amount) : ''}</td>
                          <td className="num mono">{i.amount < 0 ? formatAmount(-i.amount) : ''}</td>
                          <td>{i.currency}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={5}>
                          <b>Total</b>
                        </td>
                        <td className="num mono">
                          <b>{formatAmount(totals.debit)}</b>
                        </td>
                        <td className="num mono">
                          <b>{formatAmount(totals.credit)}</b>
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
        <Actions onClose={onClose} />
      </div>
    </Overlay>
  )
}

/** Transaction details (TB_TRANSACTION_TO_DISPLAY via the Deal No hotspot). */
export function DealModal({
  modal,
  row,
  keyYmd,
  onClose,
}: {
  modal: Modal
  row: Deal | null
  keyYmd: string
  onClose: () => void
}) {
  const rd = row ? rateDp(row) : 4
  return (
    <Overlay modal={modal} stacked labelledBy="dealTitle">
      <div className="modal modal-left modal-scrollable deal-modal">
        <Head id="dealTitle" title={row ? `Transaction ${row.rfha}` : 'Transaction Details'} onClose={onClose} />
        <div className="modal-body-scroll">
          {row ? (
            <>
              <Section title="Transaction">
                <DetailItem label="Company Code" value={`${row.bukrs} - ${row.butxt}`} />
                <DetailItem label="Deal No" value={row.rfha} />
                <DetailItem label="Status" value={row.ext_stat_desc} />
                <DetailItem label="Transaction Type" value={row.xtext} />
                <DetailItem label="Product Type" value={row.sgsart} />
                <DetailItem label="Source" value={row.tsf_code} />
                <DetailItem label="TSF Deal ID" value={row.ztsf_deal_id} />
                <DetailItem label="Olam Deal No" value={row.zolam_deal_no} />
                <DetailItem label="Buy/Sell" value={row.bs_bu} />
              </Section>
              <Section title="Counterparty">
                <DetailItem label="Counterparty" value={row.kontrh} />
                <DetailItem label="Name" value={row.bp_name} />
                <DetailItem label="Country" value={row.landx50} />
              </Section>
              <Section title="Terms">
                <DetailItem label="Trade Date" value={ymdToDmy(row.dblfz)} />
                <DetailItem label="Value Date" value={ymdToDmy(row.delfz)} />
                <DetailItem label="Currency Pair" value={row.cpair} />
                <DetailItem label="Amount 1" value={`${formatAmount(row.amt1)} ${row.curr1} (${row.bs_1})`} />
                <DetailItem label="Amount 2" value={`${formatAmount(row.amt2)} ${row.curr2} (${row.bs_2})`} />
                <DetailItem label="Contract Rate" value={formatRate(row.c_rate, rd)} />
                {row.sgsart === '12D' ? (
                  <>
                    <DetailItem label="NDF Fixing Date" value={ymdToDmy(row.ndf_date)} />
                    <DetailItem label="NDF Settlement Rate" value={row.ndf_rate ? formatRate(row.ndf_rate, rd) : ''} />
                    <DetailItem label="NDF Ref" value={row.ndf_ref} />
                  </>
                ) : null}
              </Section>
              <Section title="Accounting Assignment">
                <DetailItem label="Profit Center" value={row.prctr} />
                <DetailItem label="Business Area" value={row.rbusa} />
                <DetailItem label="Accounting Category" value={row.xportb} />
                <DetailItem label="Trade Category" value={row.refer} />
              </Section>
              <Section title={`MTM Valuation at ${ymdToDmy(keyYmd)}`}>
                <DetailItem label="Value Spot" value={formatRate(row.v_spot_n, rd)} />
                <DetailItem label="Value Swap" value={formatRate(row.v_swap_n, swapDp(row))} />
                <DetailItem label="Value Rate" value={formatRate(row.v_rate_n, rd)} />
                <DetailItem label="Amount in USD" value={formatAmount(row.usd_amt)} />
                <DetailItem label="Value Amt" value={formatAmount(row.v_amt)} />
                <DetailItem label="Val Gain/Loss" value={formatAmount(row.v_gl)} />
                <DetailItem label="MTM Doc" value={row.mtm_doc} />
                <DetailItem label="Rev Doc" value={row.rev_doc} />
                <DetailItem label="Message" value={row.msg} />
              </Section>
            </>
          ) : null}
        </div>
        <Actions onClose={onClose} />
      </div>
    </Overlay>
  )
}
