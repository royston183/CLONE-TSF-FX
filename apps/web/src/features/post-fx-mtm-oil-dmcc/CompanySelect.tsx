import { useEffect, useRef, useState } from 'react'
import { COMPANY_CODES } from './data.ts'
import { useFloatingPanel } from './floating.ts'
import { ERR_COMPANY_REQUIRED, allCompanyCodes, companyDisplay, toggleCompany } from './logic.ts'

type Props = {
  company: string[]
  /** The inline error text, or null; any text turns the field red. */
  error: string | null
  onChange: (next: string[]) => void
}

/**
 * Company Code selection (SELECT-OPTIONS s_bukrs, single values): a read-only box that opens a
 * checklist with an "All authorised" master tick. The list floats under the box, and closes on an
 * outside click, on scroll and on window resize, as in the original.
 */
export function CompanySelect({ company, error, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { style } = useFloatingPanel(open, wrapRef, panelRef, { matchWidth: true, minWidth: 260, gap: 4 }, [company])
  const display = companyDisplay(company)
  const allOn = company.length === COMPANY_CODES.length

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('click', onDocClick)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <div className={`field f-company${error ? ' has-error' : ''}`} id="field-company">
      <label htmlFor="input-company">
        Company Code<span className="req">*</span>
      </label>
      <div className={`dd${open ? ' open' : ''}`} id="dd-company" ref={wrapRef}>
        <input
          className="dd-input"
          id="input-company"
          placeholder="Select company code"
          autoComplete="off"
          readOnly
          value={display.value}
          title={display.title}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {open && (
          <div className="dd-panel" id="panel-company" ref={panelRef} style={style}>
            <label className="ms-item ms-all">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => onChange(e.target.checked ? allCompanyCodes() : [])}
              />
              <span>
                <span className="ms-code">All authorised</span>
              </span>
            </label>
            {COMPANY_CODES.map((c) => (
              <label key={c.code} className="ms-item">
                <input
                  type="checkbox"
                  value={c.code}
                  checked={company.includes(c.code)}
                  onChange={(e) => onChange(toggleCompany(company, c.code, e.target.checked))}
                />
                <span>
                  <span className="ms-code">{c.code}</span>
                  <br />
                  <span className="ms-name">{c.name}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      {/* The message element is always present in the original; hidden until the field has an error. */}
      <div className="error-msg" id="err-company">
        {error ?? ERR_COMPANY_REQUIRED}
      </div>
    </div>
  )
}
