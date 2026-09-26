import {
  BUSINESS_AREAS,
  CCY_PAIRS,
  COMPANY_CODES,
  FIXING_DATE_POOL,
  PARTNERS,
  STATUSES,
  TRADERS,
  TSF_ENTITIES,
  TXN_TYPE_DESC,
} from './data.ts'
import type { Filters } from './types.ts'

/** The ten selects in page order, each with its id and the fixed options the page filled in. */
const FILTER_SELECTS: Array<{ key: keyof Filters; id: string; label: string; options: string[] }> = [
  { key: 'companyCode', id: 'fCompanyCode', label: 'Company Code', options: COMPANY_CODES },
  { key: 'businessArea', id: 'fBusinessArea', label: 'Business Area', options: BUSINESS_AREAS.map((b) => b.name) },
  { key: 'tsfEntity', id: 'fTsfEntity', label: 'TSF Entity', options: TSF_ENTITIES },
  { key: 'txnType', id: 'fTxnType', label: 'Transaction Type', options: [TXN_TYPE_DESC] },
  { key: 'partner', id: 'fPartner', label: 'Partner', options: PARTNERS.map((p) => p.name) },
  { key: 'trader', id: 'fTrader', label: 'Trader', options: TRADERS.map((t) => t.name) },
  { key: 'currency1', id: 'fCurrency1', label: 'Currency 1', options: ['USD'] },
  { key: 'currency2', id: 'fCurrency2', label: 'Currency 2', options: CCY_PAIRS },
  { key: 'status', id: 'fStatus', label: 'Transaction Status', options: STATUSES },
  { key: 'fixingDate', id: 'fFixingDate', label: 'Fixing Date', options: FIXING_DATE_POOL },
]

export function FilterPanel({
  open,
  filters,
  onChange,
  onClear,
}: {
  open: boolean
  filters: Filters
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
            {f.options.map((o) => (
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
