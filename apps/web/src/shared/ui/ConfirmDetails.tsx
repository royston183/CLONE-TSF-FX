import type { ReactNode } from 'react'
import './ConfirmDetails.css'

/** What is being confirmed, as label / value rows for the plain Yes/No popups (rows with an empty value are skipped). */
export function ConfirmDetails({ rows }: { rows: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  const shown = rows.filter((r) => r.value !== '' && r.value != null)
  if (shown.length === 0) return null
  return (
    <dl className="cfd-list">
      {shown.map((r) => (
        <div className="cfd-row" key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
