import type { Filters } from './types.ts'

/** The ten selects in page order, each with its id. Their options come from filterPanelOptions. */
const FILTER_SELECTS: Array<{ key: keyof Filters; id: string; label: string }> = [
  { key: 'companyCode', id: 'fCompanyCode', label: 'Company Code' },
  { key: 'businessArea', id: 'fBusinessArea', label: 'Business Area' },
  { key: 'tsfEntity', id: 'fTsfEntity', label: 'TSF Entity' },
  { key: 'txnType', id: 'fTxnType', label: 'Transaction Type' },
  { key: 'partner', id: 'fPartner', label: 'Partner' },
  { key: 'trader', id: 'fTrader', label: 'Trader' },
  { key: 'currency1', id: 'fCurrency1', label: 'Currency 1' },
  { key: 'currency2', id: 'fCurrency2', label: 'Currency 2' },
  { key: 'status', id: 'fStatus', label: 'Transaction Status' },
  { key: 'fixingDate', id: 'fFixingDate', label: 'Fixing Date' },
]

export function FilterPanel({
  open,
  filters,
  options,
  onChange,
  onClear,
}: {
  open: boolean
  filters: Filters
  options: Record<keyof Filters, string[]>
  onChange: (key: keyof Filters, value: string) => void
  onClear: () => void
}) {
  return (
    <div className={`filter-panel${open ? '' : ' hidden'}`} id="filterPanel">
      {FILTER_SELECTS.map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <select id={f.id} value={filters[f.key]} onChange={(e) => onChange(f.key, e.target.value)}>
            <option value="">All</option>
            {options[f.key].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="filter-actions">
        <button className="btn btn-secondary" id="clearFiltersBtn" type="button" onClick={onClear}>
          Clear Filters
        </button>
      </div>
    </div>
  )
}
