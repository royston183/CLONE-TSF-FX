import { TRADE_CODE, TRADER_NAME } from './data.ts'
import { commitAmount, fmtDate } from './format.ts'
import { dealDescription, modelOf, nextDealId } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { MasterContract } from './types.ts'

const READONLY = { background: '#F1F3F6' }

/** Create Deal ID — dynpro 9002 (GEN_NO_DEAL / UPDATE_DEAL_ID). */
export function CreateDealModal({
  open,
  contract: mc,
  amount,
  lastDealSeq,
  onAmountChange,
  onClose,
  onCreate,
}: {
  open: boolean
  contract: MasterContract | undefined
  amount: string
  /**
   * The last number drawn from the dummy ZSGTSFNR01 counter, so the preview can show the next
   * one; null against MySQL, where the middleware's range issues the number on Create.
   */
  lastDealSeq: number | null
  onAmountChange: (value: string) => void
  onClose: () => void
  onCreate: () => void
}) {
  const model = mc ? modelOf(mc.fxModel) : undefined
  // ZSGTSFNR01/01 either way: the ABAP's GEN_NO_DEAL object, mirrored by the middleware's range.
  const [range, interval] = ['ZSGTSFNR01', '01']
  return (
    <Overlay id="deal-overlay" open={open} onClose={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <ModalHeader title="Create Deal ID" subtitle={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : ''} onClose={onClose} />
        <div className="modal-body">
          <div className="hint" style={{ marginBottom: 14 }}>
            Booking a Deal ID against this Master Contract runs the ABAP number-range object <code>{range}</code>{' '}
            (interval <code>{interval}</code>) to mint the next Deal ID, links it to this MC Ref No, and moves the Master Contract to
            status <b>04 – Deal ID Created (In-Use)</b>.
          </div>
          <div className="filter-bar" style={{ marginBottom: 14 }}>
            <div className="filter-field" style={{ width: 160 }}>
              <label>Ship Start (from MC)</label>
              <input type="text" readOnly style={READONLY} value={mc ? fmtDate(mc.shipStart) : ''} />
            </div>
            <div className="filter-field" style={{ width: 160 }}>
              <label>Ship End (from MC)</label>
              <input type="text" readOnly style={READONLY} value={mc ? fmtDate(mc.shipEnd) : ''} />
            </div>
          </div>
          <div className="filter-field" style={{ width: 220, marginBottom: 6 }}>
            <label htmlFor="ssdid-deal-amount">Deal Amount (USD)</label>
            <input
              id="ssdid-deal-amount"
              type="text"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={(e) => onAmountChange(commitAmount(e.target.value))}
            />
          </div>
          <div className="hint" style={{ marginBottom: 14 }}>
            Same shorthand accepted here (e.g. <kbd>5M</kbd>). This amount becomes the Deal ID&apos;s FX leg (Amt1) used in
            the Uti-Deal ID Amt(USD) drill-down.
          </div>

          <div className="section-label">Deal Description Preview</div>
          <div className="detail-grid">
            {mc && model ? (
              <>
                <DetailCell label="Trader" value={`${TRADER_NAME} (${TRADE_CODE})`} />
                <DetailCell label="Deal Description" value={dealDescription(mc.origin, mc.shipStart.getFullYear(), model)} accent />
                <DetailCell label="Deal Type / Sub Type" value={`${model.dealType} / ${model.subType}`} />
                <DetailCell
                  label={`Next Deal ID (Nr. Range ${range})`}
                  value={lastDealSeq === null ? 'Issued by the number range on Create' : nextDealId(lastDealSeq)}
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" type="button" onClick={onCreate}>
            Create
          </button>
        </div>
      </div>
    </Overlay>
  )
}
