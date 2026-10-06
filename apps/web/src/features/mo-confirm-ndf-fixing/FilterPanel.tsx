import { STATUSES } from './data.ts'
import { distinctOptions } from './logic.ts'
import type { Filters, NdfDeal } from './types.ts'

/** The ten selects in page order. Their options are read from the deals SAP returned, not from a fixed list. */
const FILTER_SELECTS: Array<{ key: keyof Filters; id: string; label: string; field: keyof NdfDeal }> = [
  { key: 'companyCode', id: 'fCompanyCode', label: 'Company Code', field: 'coCode' },
  { key: 'businessArea', id: 'fBusinessArea', label: 'Business Area', field: 'businessArea' },
  { key: 'tsfEntity', id: 'fTsfEntity', label: 'TSF Entity', field: 'tsfEntity' },
  { key: 'txnType', id: 'fTxnType', label: 'Transaction Type', field: 'txnTypeDesc' },
  { key: 'partner', id: 'fPartner', label: 'Partner', field: 'partnerName' },
  { key: 'trader', id: 'fTrader', label: 'Trader', field: 'trader' },
  { key: 'currency1', id: 'fCurrency1', label: 'Currency 1', field: 'currency1' },
  { key: 'currency2', id: 'fCurrency2', label: 'Currency 2', field: 'currency2' },
  { key: 'status', id: 'fStatus', label: 'Transaction Status', field: 'txnStatus' },
  { key: 'fixingDate', id: 'fFixingDate', label: 'Fixing Date', field: 'fixingDate' },
]

export function FilterPanel({
  open,
  deals,
  filters,
  onChange,
  onClear,
}: {
  open: boolean
  /** The deals the list was loaded with. */
  deals: readonly NdfDeal[]
  filters: Filters
  onChange: (key: keyof Filters, value: string) => void
  onClear: () => void
}) {
  return (
    <div className={`filter-panel${open ? '' : ' hidden'}`} id="filterPanel">
      {FILTER_SELECTS.map((f) => {
        const options = f.key === 'status' ? STATUSES.filter((s) => deals.some((d) => d.txnStatus === s)) : distinctOptions(deals, f.field)
        return (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <select id={f.id} value={filters[f.key]} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">All</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <div className="filter-actions">
        <button className="btn btn-secondary" id="clearFiltersBtn" type="button" onClick={onClear}>
          Clear Filters
        </button>
      </div>
    </div>
  )
}
