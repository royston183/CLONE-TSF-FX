/** The legacy page's inline SVG icons, stroke-drawn in currentColor. */
import type { ReactNode } from 'react'

type IconProps = { d: readonly string[]; extra?: ReactNode }

function Stroke({ d, extra }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {extra}
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  )
}

export const RefreshIcon = () => (
  <Stroke d={['M23 4v6h-6M1 20v-6h6', 'M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15']} />
)

export const SearchIcon = () => <Stroke d={['M21 21l-4.35-4.35']} extra={<circle cx="11" cy="11" r="8" />} />

export const CalendarPlaceholderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 4v5" />
  </svg>
)

export const CalculatorIcon = () => (
  <Stroke
    d={['M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01']}
    extra={<rect x="4" y="2" width="16" height="20" rx="2" />}
  />
)

export const EditIcon = () => (
  <Stroke d={['M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7', 'M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z']} />
)

export const PlusBoxIcon = () => <Stroke d={['M8 12h8M12 8v8']} extra={<rect x="3" y="3" width="18" height="18" rx="2" />} />

export const DollarIcon = () => <Stroke d={['M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6']} />

export const CancelCircleIcon = () => <Stroke d={['M15 9l-6 6M9 9l6 6']} extra={<circle cx="12" cy="12" r="10" />} />

export const CheckIcon = () => <Stroke d={['M20 6L9 17l-5-5']} />

export const AlertCircleIcon = () => <Stroke d={['M12 8v4M12 16h.01']} extra={<circle cx="12" cy="12" r="10" />} />

export const WarningIcon = () => (
  <Stroke d={['M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z']} />
)
