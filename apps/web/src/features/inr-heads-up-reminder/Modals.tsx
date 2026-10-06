import { WAITING_TRADE_INVOICE } from './data.ts'
import { statusToneClass } from './DealTable.tsx'
import { formatAmount, isoToDMY } from './format.ts'
import { DetailItem, KvRow, ModalCard, type Modal } from './modal.tsx'
import type { HeadsUpRow, MailPlan, MasterContractDetail } from './types.ts'

/** Hotspot: MC Reference -> ZSGTSFFM_MC_DETAILS( mc_ref_no ). */
export function McModal({ modal, mc }: { modal: Modal; mc: MasterContractDetail | null }) {
  return (
    <ModalCard
      modal={modal}
      id="mcModal"
      size="heads-modal"
      title={mc ? `Master Contract — ${mc.ref}` : 'Master Contract'}
      titleId="mcModalTitle"
      bodyId="mcModalBody"
      body={
        mc ? (
          <>
            <div className="detail-section">
              <div className="detail-section-title">Basic Details</div>
              <div className="detail-grid">
                <DetailItem label="MC Reference" value={mc.ref} />
                <DetailItem label="MC Date" value={isoToDMY(mc.date)} />
                <DetailItem label="Origin Entity" value={`${mc.origin} - ${mc.originName}`} />
                <DetailItem label="Region" value={mc.region} />
                <DetailItem label="MC Description" value={mc.desc} full />
                <DetailItem label="MC Amount (USD)" value={formatAmount(mc.amt)} />
              </div>
            </div>
            <div className="detail-section">
              <div className="detail-section-title">FX Model Details</div>
              <div className="detail-grid">
                <DetailItem label="FX Model" value={`${mc.modelId} - ${mc.modelDesc}`} full />
                <DetailItem label="Currency ID" value={mc.currId} />
              </div>
            </div>
          </>
        ) : null
      }
      actions={
        <button type="button" className="btn btn-secondary" onClick={modal.close}>
          Close
        </button>
      }
    />
  )
}

/** Hotspot: Deal ID -> SUBMIT zsgtsf_rdeal_trd_inv WITH p_deal = <deal id> AND RETURN. */
export function InvoiceModal({ modal, row }: { modal: Modal; row: HeadsUpRow | null }) {
  return (
    <ModalCard
      modal={modal}
      id="invoiceModal"
      size="heads-modal"
      title={row ? `Invoice — ${row.dealId}` : 'Invoice'}
      titleId="invoiceModalTitle"
      bodyId="invoiceModalBody"
      body={
        row ? (
          <>
            <div className="detail-section">
              <div className="detail-section-title">Deal</div>
              <div className="detail-grid">
                <DetailItem label="Deal ID" value={row.dealId} />
                <DetailItem
                  label="Deal Status"
                  value={<span className={statusToneClass(row.status)}>{`${row.status} - ${row.statusDesc}`}</span>}
                />
                <DetailItem label="Deal Description" value={row.dealDesc} full />
                <DetailItem label="MC Reference" value={row.mcRef} />
                <DetailItem label="Deal Maturity Date" value={isoToDMY(row.maturityDate)} />
                <DetailItem label="FX Utilisation Amount" value={row.utiAmt === null ? '' : formatAmount(row.utiAmt)} />
              </div>
            </div>
            <div className="proto-note" title="No API yet">
              {WAITING_TRADE_INVOICE}
            </div>
          </>
        ) : null
      }
      actions={
        <button type="button" className="btn btn-secondary" onClick={modal.close}>
          Close
        </button>
      }
    />
  )
}

/** Send Mail confirmation: the deals in the selection, those eligible for a mail, and the mail count. */
export function MailModal({
  modal,
  dealCount,
  plan,
  onConfirm,
}: {
  modal: Modal
  dealCount: number
  plan: MailPlan
  onConfirm: () => void
}) {
  return (
    <ModalCard
      modal={modal}
      id="mailModal"
      size="heads-modal-sm"
      title="Send Mail"
      bodyId="mailModalBody"
      body={
        <>
          <p className="confirm-text">
            Heads-up mails will be sent for the deals matching the current selection (Key Date, Region, Origin Entity, Deal ID,
            Status).
          </p>
          <div className="kv-list">
            <KvRow label="Deals in selection" value={dealCount} />
            <KvRow label="Eligible deals (status 05 / 07)" value={plan.deals.length} />
            <KvRow label="Mails to send" value={plan.mailCount} total />
          </div>
        </>
      }
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" id="btnConfirmMail" onClick={onConfirm}>
            Send Mail
          </button>
        </>
      }
    />
  )
}
