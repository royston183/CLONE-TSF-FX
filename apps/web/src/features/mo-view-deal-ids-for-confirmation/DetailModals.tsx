import type { ReactNode } from 'react'
import { lookupEntity } from './data.ts'
import { fmtAmount, fmtDate, fmtRate } from './format.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Deal } from './types.ts'

function McItem({
  label,
  children,
  valueClass,
  span2,
}: {
  label: string
  children: ReactNode
  valueClass?: string
  span2?: boolean
}) {
  return (
    <div className={span2 ? 'mc-item span2' : 'mc-item'}>
      <span className="mc-item-label">{label}</span>
      <span className={valueClass ? `mc-item-value ${valueClass}` : 'mc-item-value'}>{children}</span>
    </div>
  )
}

export function StatusText({ deal }: { deal: Deal }) {
  const cls = deal.zdeal_stat === '02' ? 'status-text-confirmed' : 'status-text-pending'
  return (
    <span className={`status-text ${cls}`}>
      {deal.zdeal_stat} – {deal.zdeal_sdesc}
    </span>
  )
}

function Shell({
  modal,
  title,
  subtitle,
  onClose,
  children,
}: {
  modal: Modal
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Overlay modal={modal} onBackdrop={onClose}>
      <div className="modal modal-md">
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="modal-title">{title}</span>
            <span className="modal-subtitle">{subtitle}</span>
          </div>
          <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Deal Analysis (zsgtsf_pdeal_id_analys), opened from the green Deal ID hotspot. */
export function DealModal({ modal, deal, onClose }: { modal: Modal; deal: Deal | null; onClose: () => void }) {
  return (
    <Shell
      modal={modal}
      title={deal ? `Deal Analysis – ${deal.zdeal_id}` : 'Deal Analysis'}
      subtitle="zsgtsf_pdeal_id_analys — Deal ID detail view"
      onClose={onClose}
    >
      {deal ? (
        <>
          <div className="mc-grid">
            <McItem label="Deal ID">
              <span className="green" style={{ color: 'var(--deal-green)' }}>
                {deal.zdeal_id}
              </span>
            </McItem>
            <McItem label="Status">
              <StatusText deal={deal} />
            </McItem>
            <McItem label="Type">{deal.zdeal_type}</McItem>
            <McItem label="Sub Type">{deal.zsub_type}</McItem>
            <McItem label="Deal Description" span2>
              {deal.zdeal_desc}
            </McItem>
            <McItem label="Start Date">{fmtDate(deal.zs_date)}</McItem>
            <McItem label="End Date">{fmtDate(deal.ze_date)}</McItem>
            <McItem label="Revised End Date">{deal.zrev_dedate ? fmtDate(deal.zrev_dedate) : '–'}</McItem>
            <McItem label="Confirmed">{deal.zconfirm === 'X' ? 'Yes' : 'No'}</McItem>
            <McItem label="Short Straddle">{deal.zss === 'X' ? 'Yes' : 'No'}</McItem>
            <McItem label="MC Reference No">
              <span style={{ color: 'var(--mc-blue)' }}>{deal.zmc_ref}</span>
            </McItem>
          </div>
          <div className="divider" />
          <div className="mc-section-title">P&amp;L Details</div>
          <div className="mc-grid">
            <McItem label="FX P&L Amount" valueClass={deal.zpl < 0 ? '' : 'green'}>
              {`${deal.zpl < 0 ? '-' : ''}${deal.zpl_curr} ${fmtAmount(Math.abs(deal.zpl))}`}
            </McItem>
            <McItem label="P&L Ex Rate">{fmtRate(deal.zpl_rate)}</McItem>
            <McItem label="FX P&L Local Amount">
              {`${deal.zpl_lamt < 0 ? '-' : ''}${deal.zpl_lcurr} ${fmtAmount(Math.abs(deal.zpl_lamt))}`}
            </McItem>
            <McItem label="Utilized Amount (USD)" valueClass="green">
              {`USD ${fmtAmount(deal.uti_amt)}`}
            </McItem>
          </div>
          <div className="divider" />
          <div className="mc-section-title">Audit Trail</div>
          <div className="mc-grid">
            <McItem label="Entered By">{deal.zcreated_by}</McItem>
            <McItem label="Entered On">{`${fmtDate(deal.zcreated_date)} ${deal.zcreated_time}`}</McItem>
            <McItem label="Last Changed By">{deal.zchanged_by}</McItem>
            <McItem label="Changed On">{`${fmtDate(deal.zchanged_date)} ${deal.zchanged_time}`}</McItem>
          </div>
        </>
      ) : null}
    </Shell>
  )
}

/** Master Contract Details (ZSGTSFFM_MC_DETAILS), opened from the blue MC Ref hotspot. */
export function McModal({ modal, deal, onClose }: { modal: Modal; deal: Deal | null; onClose: () => void }) {
  const entity = deal ? lookupEntity(deal.zorigin) : null
  return (
    <Shell
      modal={modal}
      title={deal ? `Master Contract – ${deal.zmc_ref}` : 'Master Contract Details'}
      subtitle="ZSGTSFFM_MC_DETAILS"
      onClose={onClose}
    >
      {deal ? (
        <>
          <div className="mc-grid">
            <McItem label="MC Reference No">
              <span style={{ color: 'var(--mc-blue)' }}>{deal.zmc_ref}</span>
            </McItem>
            <McItem label="MC Date">{fmtDate(deal.zmc_date)}</McItem>
            <McItem label="MC Description" span2>
              {deal.zmc_desc}
            </McItem>
            <McItem label="MC Amount (USD)" valueClass="blue">
              {`USD ${fmtAmount(deal.zamt)}`}
            </McItem>
            <McItem label="Origin Entity">{`${deal.zorigin} – ${entity ? entity.name : ''}`}</McItem>
            <McItem label="Region">{deal.zreg_id}</McItem>
          </div>
          <div className="divider" />
          <div className="mc-section-title">FX Model</div>
          <div className="mc-grid">
            <McItem label="FX Model">{deal.zmod_id}</McItem>
            <McItem label="Model Description" span2>
              {deal.zmod_desc}
            </McItem>
          </div>
          <div className="divider" />
          <div className="mc-section-title">Shipment</div>
          <div className="mc-grid">
            <McItem label="Ship Start">{fmtDate(deal.zship_start)}</McItem>
            <McItem label="Ship End">{fmtDate(deal.zship_end)}</McItem>
          </div>
        </>
      ) : null}
    </Shell>
  )
}
