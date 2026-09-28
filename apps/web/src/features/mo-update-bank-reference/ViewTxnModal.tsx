import type { ReactNode } from 'react'
import { fmtNum } from './format.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Deal } from './types.ts'

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{empty ? <span style={{ color: 'var(--text-faint)' }}>—</span> : value}</span>
    </div>
  )
}

function Status({ value }: { value: string }) {
  return <span className={`status-txt status-${value}`}>{value}</span>
}

/** The original's read-only View Transaction popup, a snapshot of the row it was opened on. */
export function ViewTxnModal({
  modal,
  row,
  isFx,
  onClose,
}: {
  modal: Modal
  row: Deal | null
  isFx: boolean
  onClose: () => void
}) {
  return (
    <Overlay modal={modal} onBackdrop={onClose}>
      <div className="modal modal-left modal-scrollable view-txn-modal">
        <div className="modal-head-row">
          <div>
            <h2>View Transaction</h2>
            <div className="sub">{row ? `${row.BUKRS} — ${row.BUTXT}` : ' '}</div>
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll">
          {row ? (
            <>
              <div className="detail-section">
                <div className="detail-section-title">Basic Data</div>
                <div className="detail-grid">
                  <DetailItem label="Transaction No" value={row.RFHA} />
                  <DetailItem label="Company Code" value={row.BUKRS} />
                  <DetailItem label="Company Name" value={row.BUTXT} />
                  <DetailItem label="Transaction Type" value={`${row.SFHAART} — ${row.XTEXT}`} />
                  <DetailItem label="Deal ID" value={row.ZTSF_DEAL_ID} />
                  <DetailItem label="MC Reference No" value={row.ZMC_REF_NO} />
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Amounts &amp; Rates</div>
                <div className="detail-grid">
                  <DetailItem label="Currency Pair" value={row.CPAIR} />
                  {isFx ? (
                    <DetailItem label="Buy/Sell 1" value={`${row.BS_1} ${row.CURR1}`} />
                  ) : (
                    <DetailItem label="Option Type" value={row.OPTION_TYPE} />
                  )}
                  <DetailItem label="Amount 1" value={`${row.CURR1} ${fmtNum(row.AMT1, 2)}`} />
                  {isFx ? (
                    <DetailItem label="Buy/Sell 2" value={`${row.BS_2 ?? ''} ${row.CURR2 ?? ''}`} />
                  ) : (
                    <DetailItem label="Strike Rate" value={fmtNum(row.STRIKE_RATE, 4)} />
                  )}
                  {isFx ? (
                    <DetailItem label="Amount 2" value={`${row.CURR2 ?? ''} ${fmtNum(row.AMT2, 2)}`} />
                  ) : (
                    <DetailItem label="Premium Amount" value={`${row.PREMIUM_CURR ?? ''} ${fmtNum(row.PREMIUM_AMT, 2)}`} />
                  )}
                  {isFx ? (
                    <DetailItem label="Spot Rate" value={fmtNum(row.SPOT, 4)} />
                  ) : (
                    <DetailItem label="Expiry Date" value={row.EXPIRY_DATE} />
                  )}
                  {isFx ? <DetailItem label="Swap Points" value={fmtNum(row.SWAP, 4)} /> : null}
                  {isFx ? <DetailItem label="All-in Rate" value={fmtNum(row.TOT_RATE, 4)} /> : null}
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Partner &amp; Trader</div>
                <div className="detail-grid">
                  <DetailItem label="Trader" value={row.RDEALER} />
                  <DetailItem label="Partner Name" value={row.BP_NAME} />
                  <DetailItem label="Partner Code" value={row.KONTRH} />
                  <DetailItem label="Business Area" value={row.RBUSA} />
                  <DetailItem label="Portfolio" value={row.RPORTB} />
                  <DetailItem label="Profit Center" value={row.PRCTR} />
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Dates &amp; Status</div>
                <div className="detail-grid">
                  <DetailItem label="Trade Date" value={row.DBLFZ} />
                  <DetailItem label="Value Date" value={row.DELFZ} />
                  <DetailItem label="Txn Status" value={<Status value={row.TXN_STATUS} />} />
                  <DetailItem label="Match/Unmatch" value={<Status value={row.MAT_UNMAT} />} />
                  <DetailItem label="External Reference" value={row.NORDEXT} />
                  <DetailItem label="Int Ref" value={row.ZOLAM_DEAL_NO} />
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
