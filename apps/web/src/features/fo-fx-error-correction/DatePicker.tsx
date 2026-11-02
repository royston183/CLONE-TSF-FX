import { useRef, type CSSProperties, type ReactNode } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { fmtDate, safeParseDate } from './format.ts'

/** The filter bar's calendar glyph; the correction popup's pickers use the 📅 emoji instead. */
export const CALENDAR_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/**
 * The page's custom DD-MM-YYYY date picker (.dp), shared by the filter bar and the Value /
 * Trade / Blotter Date fields of the FX Error Correction popup. Which picker is open is owned by
 * the parent, because opening one closes the others and an outside click closes them all.
 */
export function DatePicker({
  id,
  value,
  open,
  onOpenChange,
  onPick,
  icon = CALENDAR_ICON,
  inputStyle,
  disabled = false,
}: {
  id: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
  icon?: ReactNode
  inputStyle?: CSSProperties
  /** A read-only transaction: the input is disabled and the calendar will not open. */
  disabled?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (disabled) return
    onOpenChange(!open)
  }

  return (
    <div className="dp" ref={wrapRef}>
      <input id={id} type="text" value={value} disabled={disabled} placeholder="DD-MM-YYYY" aria-label={id === 'new-blotterdate' ? 'Blotter Date' : id === 'new-tradedate' ? 'Trade Date' : id === 'new-valuedate' ? 'Value Date' : undefined} aria-invalid={!!value && !safeParseDate(value)} onChange={e => onPick(e.target.value)} style={inputStyle} />
      <button type="button" className="dp-btn" disabled={disabled} onClick={toggle} aria-label="Open calendar">
        {icon}
      </button>
      <DatePopup
        open={open && !disabled}
        anchorRef={wrapRef}
        value={safeParseDate(value)}
        title={id === 'new-blotterdate' ? 'Blotter Date' : id === 'new-tradedate' ? 'Trade Date' : id === 'new-valuedate' ? 'Value Date' : 'Date'}
        onSelect={(date) => {
          onPick(fmtDate(date))
          onOpenChange(false)
        }}
        onClose={() => onOpenChange(false)}
      />
    </div>
  )
}
