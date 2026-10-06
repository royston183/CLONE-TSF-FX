import { STATUS_MAP } from './data.ts'
import { toDisplayDate } from './format.ts'
import type { DealRow, FxRow, InvoiceRow, PlRow } from './types.ts'

/**
 * The FX legs, planned invoices and planned P&L are ZSGTSF_PDEAL_ID_ANALYS's own reads (VTBFHA,
 * ZSGTSFV_FX, ZSGTSFTR_INV_REF ...). That program is not in this export, so the grids stay
 * empty and say why instead of showing generated values.
 */
const WAITING_ANALYSIS = 'WAITING FOR API — Deal ID Analysis (ZSGTSF_PDEAL_ID_ANALYS) is not in this export; its FX deal, planned invoice and P&L reads have no API yet'

function BasicField({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="basic-field">
      <label>{label}</label>
      <div className={strong ? 'readonly-field strong' : 'readonly-field'}>{value || '—'}</div>
    </div>
  )
}

function FxTable({ rows, emptyText }: { rows: FxRow[]; emptyText: string }) {
  return (
    <div className="analysis-table-wrap">
      <table className="analysis-table">
        <thead>
          <tr>
            <th>Deal Type</th>
            <th>Entity</th>
            <th>Company Code</th>
            <th>Business Partner</th>
            <th>Transaction</th>
            <th>Txn Type</th>
            <th>Description</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>B/S 1</th>
            <th>Curr 1</th>
            <th className="num">Amount 1</th>
            <th>B/S 2</th>
            <th>Curr 2</th>
            <th className="num">Amount 2</th>
            <th className="num">All in Rate</th>
            <th>Txn Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="analysis-empty" colSpan={17}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.type}>
                <td>{r.type}</td>
                <td>{r.entity}</td>
                <td>{r.bukrs}</td>
                <td>{r.partner}</td>
                <td>{r.rfha}</td>
                <td>{r.product}</td>
                <td>{r.txn}</td>
                <td>{r.start}</td>
                <td>{r.end}</td>
                <td>{r.bs1}</td>
                <td>{r.curr1}</td>
                <td className="num">{r.amt1}</td>
                <td>{r.bs2}</td>
                <td>{r.curr2}</td>
                <td className="num">{r.amt2}</td>
                <td className="num">{r.rate}</td>
                <td>{r.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceTable({ rows, emptyText }: { rows: InvoiceRow[]; emptyText: string }) {
  return (
    <div className="analysis-table-wrap">
      <table className="analysis-table">
        <thead>
          <tr>
            <th>Trade Type</th>
            <th>Deal Type</th>
            <th>Sell</th>
            <th>Buy</th>
            <th>Invoice Currency</th>
            <th className="num">Invoice Amount (USD)</th>
            <th className="num">Exchange Rate</th>
            <th className="num">Inv Amount</th>
            <th>Inv TRM Ref No</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="analysis-empty" colSpan={9}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.ref}>
                <td>{r.ttype}</td>
                <td>{r.dtype}</td>
                <td>{r.sell}</td>
                <td>{r.buy}</td>
                <td>{r.curr}</td>
                <td className="num">{r.amt}</td>
                <td className="num">{r.ex}</td>
                <td className="num">{r.inv}</td>
                <td>{r.ref}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function PlTable({ rows, emptyText }: { rows: PlRow[]; emptyText: string }) {
  return (
    <div className="analysis-table-wrap">
      <table className="analysis-table">
        <thead>
          <tr>
            <th>Type</th>
            <th className="num">Foreign Amt 1</th>
            <th className="num">Local Amt 1</th>
            <th className="num">Foreign Amt 2</th>
            <th className="num">Local Amt 2</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="analysis-empty" colSpan={5}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.type}>
                <td>{r.type}</td>
                <td className="num">{r.f1}</td>
                <td className="num">{r.l1}</td>
                <td className="num">{r.f2}</td>
                <td className="num">{r.l2}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** "Deal ID Analysis" (ZSGTSF_PDEAL_ID_ANALYS), the fullscreen workspace opened from the Deal ID hotspot. */
export function DealWorkspace({
  row,
  onClose,
  onRefresh,
  onChange,
  onPremium,
  onEditPair,
  onCancel,
  onDms,
  onReverse,
}: {
  row: DealRow
  onClose: () => void
  onRefresh: () => void
  onChange: () => void
  onPremium: () => void
  onEditPair: () => void
  onCancel: () => void
  onDms: () => void
  onReverse: () => void
}) {
  const fxRows: FxRow[] = []
  const invoiceRows: InvoiceRow[] = []
  const plRows: PlRow[] = []
  const showInitialActions = row.dealStatus === '01'
  const showReverse = (row.dealStatus as string) === '02' || (row.dealStatus as string) === '03'

  return (
    <div className="deal-workspace open" aria-hidden="false">
      <header className="topbar">
        <button className="back-btn" type="button" title="Back to Invoice Status" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>
        <div className="brand-mark" aria-label="Fourth Signal">
          <span className="m1" />
          <span className="m2" />
          <span className="m3" />
          <span className="m4" />
        </div>
        <div className="title-wrap">
          <h1>Deal ID Analysis</h1>
          <span className="title-sub">ZSGTSF_PDEAL_ID_ANALYS</span>
        </div>
      </header>
      <main className="deal-workspace-main">
        <div className="deal-workspace-content">
          <div className="deal-action-strip">
            {showInitialActions ? (
              <>
                <button className="deal-action-btn primary" type="button" onClick={onChange}>
                  Change/Confirm
                </button>
                <button className="deal-action-btn" type="button" onClick={onEditPair}>
                  Edit Deal Pair
                </button>
                <button className="deal-action-btn danger" type="button" onClick={onCancel}>
                  Cancel Deal ID
                </button>
              </>
            ) : null}
            <button className="deal-action-btn" type="button" onClick={onPremium}>
              Premium Adjustment
            </button>
            {showReverse ? (
              <button className="deal-action-btn" type="button" onClick={onReverse}>
                Reverse MO Confirmation
              </button>
            ) : null}
            <button className="deal-action-btn" type="button" onClick={onDms}>
              DMS
            </button>
            <button className="deal-action-btn" type="button" onClick={onRefresh}>
              Refresh
            </button>
          </div>

          <div className="deal-summary-line">
            <span className="txn-chip">Selected Deal ID</span>
            <strong>{row.dealId}</strong>
            <span>from Invoice Status report</span>
          </div>

          <section className="analysis-card">
            <div className="analysis-card-head">Basic Selection</div>
            <div className="basic-grid">
              <BasicField label="Deal ID" value={row.dealId} strong />
              <BasicField label="Deal ID Description" value={row.dealDesc} />
              <BasicField label="Deal Start Date" value={toDisplayDate(row.startDate)} />
              <BasicField label="Deal End Date" value={toDisplayDate(row.endDate)} />
              <BasicField label="MC Ref No" value={row.mcRef} />
              <BasicField label="MC Description" value={row.mcDesc} />
              <BasicField label="MC Date" value={toDisplayDate(row.mcDate)} />
              <BasicField label="Ship Start Date" value={toDisplayDate(row.shipStart)} />
              <BasicField label="Ship End Date" value={toDisplayDate(row.shipEnd)} />
              <BasicField label="FX Model ID" value={row.modelId} />
              <BasicField label="Model Description" value={row.modelDesc} />
              <BasicField label="Entity String" value={row.entityString} />
              <BasicField label="Currency String" value={row.currencyString} />
              <BasicField label="Trader" value={row.trader} />
              <div className="basic-field">
                <label>Deal ID Status</label>
                <select className="analysis-select" disabled value={row.dealStatus}>
                  {(Object.keys(STATUS_MAP) as Array<keyof typeof STATUS_MAP>).map((code) => (
                    <option key={code} value={code}>
                      {code} - {STATUS_MAP[code]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="analysis-card">
            <div className="analysis-card-head">
              FX Deals<span className="subtle">{fxRows.length} linked transaction(s)</span>
            </div>
            <FxTable rows={fxRows} emptyText={WAITING_ANALYSIS} />
          </section>

          {row.dealStatus !== '30' ? (
            <>
              <section className="analysis-card">
                <div className="analysis-card-head">Deal ID: Planned Trade Invoices</div>
                <InvoiceTable rows={invoiceRows} emptyText={WAITING_ANALYSIS} />
              </section>
              <section className="analysis-card">
                <div className="analysis-card-head">Deal ID: Planned P&amp;L</div>
                <PlTable rows={plRows} emptyText={WAITING_ANALYSIS} />
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
