import type { ReactNode } from 'react'

/** A full, readable record review; batch items can each be expanded without omitting records. */
export function ReviewDetails({ title, rows, open = true }: { title: string; rows: readonly (readonly [string, ReactNode])[]; open?: boolean }) {
  return (
    <details className="confirmation-review-record" open={open}>
      <summary>{title}</summary>
      <dl className="confirmation-review-details">
        {rows.map(([label, value]) => (
          <div className="confirmation-review-row" key={label}>
            <dt>{label}</dt>
            <dd>{value === '' || value === null || value === undefined ? '—' : value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
