import { dmyFromIso } from '../../shared/fx/sap.ts'
import { formatAmount } from './logic.ts'
import type { LimitDeal, MailPreview } from './types.ts'

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value === '' ? '—' : value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">{title}</div>
      <div className="detail-grid">{children}</div>
    </div>
  )
}

/** Deal details opened from the Deal ID link of the bank-wise summary. */
export function DealModal({ deal: d, onClose }: { deal: LimitDeal; onClose: () => void }) {
  return (
    <div className="modal-overlay z2" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal m-deal" role="dialog" aria-modal="true" aria-labelledby="dealTitle">
        <div className="modal-head-row">
          <h2 id="dealTitle">Deal {d.dealId}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">
          <Section title="Deal">
            <Item label="Deal ID" value={d.dealId} />
            <Item label="Deal Status" value={d.statusDesc} />
            <Item label="Deal ID Desc" value={d.desc} />
            <Item label="Model" value={d.model} />
            <Item label="Region ID" value={d.region} />
            <Item label="Transaction No" value={d.txnNo} />
          </Section>
          <Section title="Counterparty & amounts">
            <Item label="BP Name" value={d.bpName} />
            <Item label="Currency Pair" value={d.pair} />
            <Item label="Deal Amount (USD)" value={formatAmount(d.dealAmt)} />
            <Item label="Rate" value={d.rate ? d.rate.toFixed(4) : ''} />
            <Item label="Buy" value={`${formatAmount(d.buyAmt)} ${d.buyCurr}`} />
            <Item label="Sell" value={`${formatAmount(d.sellAmt)} ${d.sellCurr}`} />
          </Section>
          <Section title="Dates">
            <Item label="Trade Date" value={dmyFromIso(d.tradeDate)} />
            <Item label="Value Date" value={dmyFromIso(d.valueDate)} />
            <Item label="Deal Start Date" value={dmyFromIso(d.startDate)} />
            <Item label="Deal End Date" value={dmyFromIso(d.endDate)} />
          </Section>
          <Section title="Master contract">
            <Item label="Mc Reference" value={d.mcRef} />
            <Item label="Mc Date" value={dmyFromIso(d.mcDate)} />
            <Item label="MC Amount" value={formatAmount(d.mcAmt)} />
          </Section>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/** The approval e-mail the program sends after a limit is set; shown as a preview only. */
export function MailModal({ mail, onClose }: { mail: MailPreview; onClose: () => void }) {
  return (
    <div className="modal-overlay z3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal m-email" role="dialog" aria-modal="true" aria-labelledby="mailTitle">
        <div className="modal-head-row">
          <h2 id="mailTitle">Approval E-mail</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">
          <div className="mail-meta">
            <b>Subject:</b> {mail.subject}
            <br />
            <b>To:</b> Approver (recipients configured in the system)
          </div>
          <div className="mail-body">
            <p>Dear Jayant,</p>
            <p>
              <b>Kindly review the below limit proposal and provide your approval</b>
            </p>
            <table>
              <tbody>
                {mail.rows.map(([label, value]) => (
                  <tr key={label}>
                    <td className="lg">{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="demo-note">
            Preview only: this screen does not send the e-mail. The limit stays &ldquo;Awaiting approval&rdquo; until the approver&rsquo;s reply is processed by the
            system outside this screen.
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
