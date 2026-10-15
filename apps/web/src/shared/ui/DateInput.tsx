import { useCallback, useRef, useState, type InputHTMLAttributes } from 'react'
import { DatePopup } from './DatePopup.tsx'

const pad = (n: number) => String(n).padStart(2, '0')

/** yyyy-mm-dd (what <input type="date"> held) to a local Date, or null when blank / not a real date. */
export function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null
}
export const dateToIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** dd-mm-yyyy (also dd/mm/yyyy, dd.mm.yyyy) to a local Date, or null. */
export function dmyToDate(dmy: string): Date | null {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]) ? d : null
}
export const dateToDmy = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  /** yyyy-mm-dd, or '' for none: the same value an <input type="date"> held. */
  value: string
  onChange: (iso: string) => void
  /** yyyy-mm-dd bounds, like the native min / max. */
  min?: string
  max?: string
  /** Accessible name; also the calendar's title. */
  'aria-label': string
}

/**
 * Drop-in for <input type="date">: the value is still yyyy-mm-dd, but it is typed as dd-mm-yyyy and
 * picked on the shared calendar (DatePopup) instead of the browser's own picker. Typing commits on
 * blur or Enter; an unreadable entry snaps back to the last good value.
 */
export function DateInput({ value, onChange, min, max, className, disabled, 'aria-label': ariaLabel, ...rest }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const date = isoToDate(value)
  const shown = draft ?? (date ? dateToDmy(date) : '')
  const close = useCallback(() => setOpen(false), [])

  const commit = () => {
    if (draft === null) return
    const typed = draft.trim()
    setDraft(null)
    if (typed === '') return onChange('')
    const parsed = dmyToDate(typed)
    if (parsed) onChange(dateToIso(parsed))
  }

  return (
    <div className="sdp-field" ref={wrap}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={rest.placeholder ?? 'DD-MM-YYYY'}
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      <button type="button" className="sdp-trigger" disabled={disabled} aria-label={`Choose ${ariaLabel}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7 2v4M17 2v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <DatePopup
        open={open && !disabled}
        anchorRef={wrap}
        value={date}
        title={ariaLabel}
        min={min ? (isoToDate(min) ?? undefined) : undefined}
        max={max ? (isoToDate(max) ?? undefined) : undefined}
        onSelect={(d) => {
          setDraft(null)
          onChange(dateToIso(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
