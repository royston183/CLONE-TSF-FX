import { Fragment } from 'react'
import { fmtDate, fmtDateTime, fmtNum } from './format.ts'
import { computeAmounts, payTermLabel, statusName } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { Deal, MasterContract } from './types.ts'

/** Hotspot on MC Ref No — function module ZSGTSFFM_MC_DETAILS. */
export function McDetailModal({
  open,
  contract: mc,
  deals,
  onClose,
}: {
  open: boolean
  contract: MasterContract | undefined
  deals: Deal[]
  onClose: () => void
}) {
  const a = mc ? computeAmounts(mc, deals) : null
  return (
    <Overlay id="mcdetail-overlay" open={open} onClose={onClose}>
      <div className="modal-card" style={{ maxWidth: 760 }}>
        <ModalHeader title="Master Contract Details" subtitle={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : ''} onClose={onClose} />
        <div className="modal-body">
          <div className="detail-grid">
            {mc && a ? (
              <>
                <DetailCell label="MC Ref No" value={mc.mcRef} accent />
                <DetailCell label="MC Status" value={statusName(mc.mcStat)} />
                <DetailCell label="MC Description" value={mc.mcDesc} />
                <DetailCell label="Sell / Buy" value={mc.sellBuy === 'S' ? 'Sell' : 'Buy'} />
                <DetailCell label="Origin Entity" value={mc.origin} />
                <DetailCell label="Commodity" value={`${mc.commodityCode} - ${mc.commodityDesc}`} />
                <DetailCell label="MC Date" value={fmtDate(mc.mcDate)} />
                <DetailCell label="Ship Window" value={`${fmtDate(mc.shipStart)} to ${fmtDate(mc.shipEnd)}`} />
                <DetailCell label="MC Amount" value={`USD ${fmtNum(mc.amtUSD)} / ${mc.origCurr} ${fmtNum(mc.amtOrigin)}`} />
                <DetailCell label="Exchange Rate" value={mc.exRate.toFixed(4)} />
                <DetailCell label="FX Model" value={`${mc.fxModel} - ${mc.modelDesc}`} />
                <DetailCell label="Payment Terms" value={payTermLabel(mc.payTerms)} />
                <DetailCell label="Port of Shipment" value={mc.pos} />
                <DetailCell label="Port of Destination" value={mc.pod} />
                <DetailCell label="Utilized (Deal ID) Amt" value={`USD ${fmtNum(a.uti)}`} />
                <DetailCell label="Balance Amt" value={`USD ${fmtNum(a.bal)}`} />
                {a.exp > 0 ? <DetailCell label="Expiry Amount" value={`USD ${fmtNum(a.exp)}`} /> : null}
                <DetailCell label="MO Remarks" value={mc.moRemarks || '-'} />
                <DetailCell label="FO Remarks" value={mc.foRemarks || '-'} />
              </>
            ) : null}
          </div>
          <div className="section-label">Entity String Flow</div>
          <div className="entity-flow">
            {mc ? (
              <>
                {mc.entityDesc.split('-').map((e, i) => (
                  <Fragment key={i}>
                    {i > 0 ? <span className="arrow">→</span> : null}
                    <span className="ent-chip">{e}</span>
                  </Fragment>
                ))}
                <span className="arrow" style={{ marginLeft: 10 }}>
                  | Currency String:
                </span>{' '}
                <span className="ent-chip" style={{ background: '#fff' }}>
                  {mc.currDesc}
                </span>
              </>
            ) : null}
          </div>
          <div className="section-label">Supporting Document</div>
          <div className="detail-grid">
            {mc ? (
              <>
                <DetailCell label="Document Date" value={fmtDate(mc.docDate)} />
                <DetailCell label="Source Path" value={mc.sourcePath} />
                <DetailCell label="Created By / On" value={`${mc.createdBy}, ${fmtDateTime(mc.createdOn, mc.createdTime)}`} />
                <DetailCell
                  label="Changed By / On"
                  value={mc.changedBy ? `${mc.changedBy}, ${fmtDate(mc.changedOn)}` : '- not yet changed'}
                />
              </>
            ) : null}
          </div>
          <div className="note">
            <strong>Note:</strong> This popup mirrors the hotspot click on <b>MC Ref No</b> in the ABAP ALV, which calls
            function module <code>ZSGTSFFM_MC_DETAILS</code>.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
