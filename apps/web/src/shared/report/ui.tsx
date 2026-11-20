import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import '../../features/fo-create-master-contract/fo-create-master-contract.legacy.css'
import '../../features/fo-create-master-contract/fo-create-master-contract.dark.css'
import './report.css'

/**
 * The pieces the report screens (FX Deal P&L, FX Position Dashboard) share. Their look is the Create Master Contract
 * screen's: this borrows its stylesheet, so a screen wrapped in <div className="fomc"> gets the same header, KPI cards,
 * cards, tables, buttons, status colours and pop-ups, in light and night mode.
 */

const BRAND_LOGO = 'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

/** The tinted page header of the Master Contract screen: back, logo, title and subtitle, then the screen's own actions. */
export function ReportHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <BackButton className="fx-back-btn" />
      <img className="logo-img" src={BRAND_LOGO} alt="Fourth Signal" />
      <div className="header-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="rpt-actions">{children}</div>
      <SignOutButton className="btn btn-secondary" />
    </div>
  )
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const on = () => setReduced(query.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [])
  return reduced
}

/** 1,234 / -1,234; the same everywhere. */
export function fmt(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '—'
  const text = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return value < 0 && Number(text.replace(/,/g, '')) !== 0 ? '-' + text : text
}

/** A number that counts up to its value; it jumps straight there when the user prefers reduced motion. */
export function Counter({ value, decimals = 0, format }: { value: number; decimals?: number; format?: (v: number) => string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) {
      setShown(value)
      from.current = value
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 650)
      setShown(origin + (value - origin) * (1 - (1 - t) ** 3))
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])
  const text = format ?? ((v: number) => fmt(decimals ? v : Math.round(v), decimals))
  return <>{text(shown)}</>
}

/** A signed amount, green for a gain and red for a loss, with its currency when it has one. */
export function Amount({ value, ccy, decimals = 0, plain = false }: { value: number | null | undefined; ccy?: string; decimals?: number; plain?: boolean }) {
  if (value === null || value === undefined) return <span className="rpt-nil">—</span>
  const tone = plain || !value ? '' : value > 0 ? ' pos' : ' neg'
  return (
    <span className={`rpt-amt${tone}`}>
      {fmt(value, decimals)}
      {ccy ? <small>{ccy}</small> : null}
    </span>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rpt-skel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ width: `${88 - ((i * 13) % 34)}%` }} />)}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'error'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rpt-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
      {action}
    </div>
  )
}

/** Opens on a single click or tap, a double-click, or Enter / Space: every way to reach the same thing. */
export function opener(open: () => void) {
  return {
    onClick: open,
    onDoubleClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}
