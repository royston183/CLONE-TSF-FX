import { CURRENCY_PAIRS, GROUPS, TRADERS, partnerOf } from './data.ts'
import { fmtDate, fmtNum } from './format.ts'
import { STATUS_LABEL, bsText, companyCodeOfRow, currencyPairOfRow, listPnl, partnerLabel } from './logic.ts'
import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { BlotterRow, BusinessPartner, TxnListCriteria } from './types.ts'

const HEADS = [
  'RFHA',
  'Status',
  'Company Code',
  'BP',
  'Trade Date',
  'Value Date',
  'Group',
  'Trader',
  'Curr Pair',
  'BS-1',
  'Curr 1',
  'Amt 1',
  'BS-2',
  'Curr 2',
  'Amt 2',
  'Spot',
  'Swap',
  'All in Rate',
  'MC Ref',
  'Deal ID',
  'Deal Type',
  'P&L',
]

/** View Txn List: the standalone ZSGTSF_RFX_LIST over this blotter's rows. */
export function TxnListModal({
  modals,
  crit,
  result,
  partners,
  onCrit,
  onGroup,
  onRun,
  onReset,
  onViewRow,
}: {
  modals: ModalStack
  crit: TxnListCriteria
  /** The rows of the last Run; null before the first. */
  result: BlotterRow[] | null
  partners: BusinessPartner[]
  onCrit: (patch: Partial<TxnListCriteria>) => void
  onGroup: (group: string) => void
  onRun: () => void
  onReset: () => void
  onViewRow: (id: string) => void
}) {
  const close = () => modals.close('list')
  const traders = TRADERS.filter((t) => !crit.group || t.group === crit.group)
  const n = result?.length ?? 0

  return (
    <Overlay id="list" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 1220 }}>
        <ModalHeader
          title="FX Transaction List"
          subtitle="Standalone representation of ZSGTSF_RFX_LIST"
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Selection</div>
          <div className="aux-form-grid">
            <div className="form-field">
              <label>Blotter Date *</label>
              <input
                id="list-date"
                type="text"
                placeholder="dd-mm-yyyy"
                value={crit.date}
                onChange={(e) => onCrit({ date: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Group</label>
              <select id="list-group" value={crit.group} onChange={(e) => onGroup(e.target.value)}>
                <option value="">All Groups</option>
                {GROUPS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} {g.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Trader</label>
              <select id="list-trader" value={crit.trader} onChange={(e) => onCrit({ trader: e.target.value })}>
                <option value="">All Traders</option>
                {traders.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Currency Pair</label>
              <select id="list-cpair" value={crit.cpair} onChange={(e) => onCrit({ cpair: e.target.value })}>
                <option value="">All Currency Pairs</option>
                {CURRENCY_PAIRS.map((p) => (
                  <option key={p.pair} value={p.pair}>
                    {p.pair}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Layout</label>
              <select id="list-layout" value={crit.layout} onChange={(e) => onCrit({ layout: e.target.value })}>
                <option value="DEFAULT">Default</option>
                <option value="COMPACT">Compact</option>
              </select>
            </div>
            <label className="aux-check">
              <input
                id="list-email"
                type="checkbox"
                checked={crit.email}
                onChange={(e) => onCrit({ email: e.target.checked })}
              />{' '}
              Email output
            </label>
          </div>
          <div className="aux-actions">
            <button type="button" className="tb-btn primary" onClick={onRun}>
              Run
            </button>
            <button type="button" className="tb-btn" onClick={onReset}>
              Reset
            </button>
            <span className="badge-blue" id="list-result-count">
              {n} record{n === 1 && result ? '' : 's'}
            </span>
          </div>
          <div className="section-label">FX Transactions</div>
          <div className="aux-table-wrap">
            <table className="aux-table" id="txn-list-table">
              {result === null ? (
                <tbody>
                  <tr>
                    <td className="upload-preview-empty">Choose the selection criteria and click Run.</td>
                  </tr>
                </tbody>
              ) : (
                <>
                  <thead>
                    <tr>
                      {HEADS.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.length ? (
                      result.map((r) => (
                        <ListRow key={r.id} r={r} listed={result} partners={partners} onViewRow={onViewRow} />
                      ))
                    ) : (
                      <tr>
                        <td colSpan={22} className="upload-preview-empty">
                          No FX transactions match the selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function ListRow({
  r,
  listed,
  partners,
  onViewRow,
}: {
  r: BlotterRow
  listed: BlotterRow[]
  partners: BusinessPartner[]
  onViewRow: (id: string) => void
}) {
  const bp = partnerOf(partners, r.bp)
  const { pnl, curr } = listPnl(r, listed)
  return (
    <tr className={r.status === 'RELEASED' ? 'released-row' : ''}>
      <td>
        {r.transactionNumber ? (
          <button
            type="button"
            className="rfha-link"
            onClick={(e) => {
              e.stopPropagation()
              onViewRow(r.id)
            }}
          >
            {r.transactionNumber}
          </button>
        ) : (
          '-'
        )}
      </td>
      <td>{STATUS_LABEL[r.status]}</td>
      <td>{companyCodeOfRow(r)}</td>
      <td>{bp ? partnerLabel(bp) : r.bp}</td>
      <td>{fmtDate(r.tradeDate)}</td>
      <td>{fmtDate(r.valueDate)}</td>
      <td>{r.group || '-'}</td>
      <td>{r.trader || '-'}</td>
      <td>{currencyPairOfRow(r)}</td>
      <td>{bsText(r.buySell)}</td>
      <td>{r.curr1}</td>
      <td className="num">{fmtNum(r.amt1)}</td>
      <td>{bsText(r.buySell2)}</td>
      <td>{r.curr2}</td>
      <td className="num">{fmtNum(r.amt2)}</td>
      <td className="num">{fmtNum(r.spotRate, 4)}</td>
      <td className="num">{fmtNum(r.swapPoints, 2)}</td>
      <td className="num">{fmtNum(r.totalRate, 4)}</td>
      <td>{r.mcRef || '-'}</td>
      <td>{r.dealId || '-'}</td>
      <td>{r.dealType || '-'}</td>
      <td className={pnl === null ? '' : pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}>
        {pnl === null ? '-' : `${curr} ${fmtNum(pnl)}`}
      </td>
    </tr>
  )
}
