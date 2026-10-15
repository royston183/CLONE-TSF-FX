import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { DateInput } from '../../shared/ui/DateInput.tsx'
import { formatAmount, formatAmountWhileTyping, parseAmount } from '@slc/api-client'
import { applyInterestCategory, isFixedInterest, isPrepayStructure } from './form.ts'
import type { OttkForm } from './form.ts'
import type { CoCodeRow, EntityRow, Lookups } from './types.ts'

export const CCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD']

export const STRUCTURE_OPTIONS = [
  { value: 'DSX', label: 'DSX — Deposit Set Off - Cross Border' },
  { value: 'LCP', label: 'LCP — LC Prepayment' },
  { value: 'CC DSX', label: 'CC DSX — Cross Currency DSX' },
  { value: 'CC LCP', label: 'CC LCP — Cross Currency LCP' },
]

export type OttkModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  editKey: string
  statusText: string
  createdBy: string
  form: OttkForm
  onFormChange: (form: OttkForm) => void
  lookups: Lookups
  amountErrors: Record<string, boolean>
  onOpenCharges: () => void
  onClear: () => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}

/** One labelled control in the modal grid; matches the legacy `.field` markup. */
function Field({
  label,
  htmlFor,
  size,
  children,
  hidden,
  required,
}: {
  label: ReactNode
  htmlFor?: string
  /** Caps the control's width for values that are never long — see ottk.overrides.css. */
  size?: 'num' | 'code' | 'date'
  children: ReactNode
  hidden?: boolean
  /** Marks the label with a red asterisk; the save handler enforces the value. */
  required?: boolean
}) {
  return (
    <div className={size ? `field narrow-${size}` : 'field'} hidden={hidden}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-title">{title}</div>
      <div className="fields">{children}</div>
    </section>
  )
}

/**
 * Create / Edit Origination Ticket.
 *
 * Reproduces legacy/OTTK.html's #ottkModal element for element: the five `.section` blocks
 * in their original order, the same field order within each, and the same `.compound`
 * groupings — all of which the original stylesheet lays out and colours by position.
 */
export function OttkModal(props: OttkModalProps) {
  const {
    open,
    mode,
    editKey,
    statusText,
    createdBy,
    form,
    onFormChange,
    lookups,
    amountErrors,
    onOpenCharges,
    onClear,
    onClose,
    onSave,
    saving,
  } = props

  const typeRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => typeRef.current?.focus(), 80)
    // The legacy page put .modal-open on <body> to stop the page behind from scrolling.
    document.body.classList.add('modal-open')
    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove('modal-open')
    }
  }, [open])

  const set = <K extends keyof OttkForm>(key: K, value: OttkForm[K]) => onFormChange({ ...form, [key]: value })

  /** Entity drives the description plus the applicant/beneficiary tokens, then the CoCode lookup. */
  const onEntityChange = (id: string) => {
    const entity: EntityRow | undefined = lookups.entities.find((e) => e.ZentId === id)
    const applicant = entity?.Zent2 ?? ''
    const next: OttkForm = {
      ...form,
      entityCode: id,
      entityString: entity?.ZentDesc ?? '',
      lcBeneficiary: entity?.Zent1 ?? '',
      lcApplicant: applicant,
    }
    onFormChange(withCoCode(next, applicant, lookups.coCodes))
  }

  /** Business Area is fully derived from the bank; both fields are read-only. */
  const onBankChange = (zbp: string) => {
    const bank = lookups.banks.find((b) => b.Zbp === zbp)
    onFormChange({
      ...form,
      bank: zbp,
      businessAreaCode: bank?.Zrbusa ?? '',
      businessAreaName: bank?.ZbaText ?? '',
    })
  }

  /** Company Code stays editable — this only fills it when the applicant matches a mapping. */
  const onApplicantChange = (applicant: string) =>
    onFormChange(withCoCode({ ...form, lcApplicant: applicant }, applicant, lookups.coCodes))

  const amountProps = (key: keyof OttkForm) => ({
    className: `fs-amount-input${amountErrors[key as string] ? ' field-error' : ''}`,
    inputMode: 'decimal' as const,
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      set(key, formatAmountWhileTyping(event.target.value) as OttkForm[typeof key]),
    onBlur: () => {
      const parsed = parseAmount(form[key])
      if (parsed !== null) set(key, formatAmount(parsed) as OttkForm[typeof key])
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
  })

  const fixed = isFixedInterest(form.interestCategory)
  const prepay = isPrepayStructure(form.structure)

  return (
    <div
      className={open ? 'modal-backdrop open' : 'modal-backdrop'}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="ottk-modal">
        <div className="modal-head">
          <div className="modal-heading">
            <div className="modal-heading-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
              </svg>
            </div>
            <div>
              <h2 id="modalTitle">{mode === 'edit' ? 'Edit Origination Ticket' : 'Create Origination Ticket'}</h2>
              <p id="modalSubtitle">
                {mode === 'edit'
                  ? `Origination · Edit  |  OTTK #${editKey}  |  ${statusText}`
                  : 'Origination · New  |  USD  |  Draft'}
              </p>
            </div>
          </div>
          <div className="modal-head-right">
            <div className="modal-head-created" hidden={!createdBy}>
              <span className="modal-head-created-label">Created By</span>
              <b>{createdBy}</b>
            </div>
            <button type="button" className="modal-close" aria-label="Close modal" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="modal-content-grid">
          <Section title="Transaction Details">
            <Field label="OTTK Type" htmlFor="type">
              <select id="type" ref={typeRef} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="01">01 New</option>
                <option value="02">02 With Ref DTTK</option>
              </select>
            </Field>
            <Field label="Structure" htmlFor="structure">
              <select id="structure" value={form.structure} onChange={(e) => set('structure', e.target.value)}>
                <option value="">Select structure</option>
                {STRUCTURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entity String" htmlFor="entityCode">
              <div className="compound">
                <select id="entityCode" value={form.entityCode} onChange={(e) => onEntityChange(e.target.value)}>
                  <option value="">Select entity</option>
                  {lookups.entities.map((e) => (
                    <option key={e.ZentId} value={e.ZentId}>
                      {e.ZentId}
                    </option>
                  ))}
                </select>
                <input placeholder="(auto)" readOnly value={form.entityString} />
              </div>
            </Field>
            <Field label="OT Trader" htmlFor="trader">
              <select id="trader" value={form.trader} onChange={(e) => set('trader', e.target.value)}>
                <option value="">Select trader</option>
                <option value="OTL">OTL</option>
                <option value="OGA">OGA</option>
              </select>
            </Field>
          </Section>

          <Section title="Trade Details">
            <Field label="LC Issuing Bank" htmlFor="bank">
              <select id="bank" value={form.bank} onChange={(e) => onBankChange(e.target.value)}>
                <option value="">Select bank</option>
                {lookups.banks.map((b) => (
                  <option key={b.Zbp} value={b.Zbp}>
                    {b.Zbp} — {b.BpName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="OTTK Trade Value">
              <div className="compound">
                <input
                  {...amountProps('tradeValue')}
                  placeholder="e.g. 1.5M"
                  title="Enter a number or use K, M, B, T (example: 1.5M)"
                />
                <select
                  className="suffix"
                  value={form.tradeValueCcy}
                  onChange={(e) => set('tradeValueCcy', e.target.value)}
                >
                  {CCY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Expected LC Date" htmlFor="lcdate">
              <DateInput id="lcdate" aria-label="Expected LC Date" value={form.lcdate} onChange={(v) => set('lcdate', v)} />
            </Field>
            <Field label="Expected LC Tenor">
              <div className="compound">
                <input
                  className="short num-input"
                  placeholder="0"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.tenor}
                  onChange={(e) => set('tenor', e.target.value)}
                />
                <span className="suffix">days</span>
              </div>
            </Field>
            <Field label="Payment Terms">
              <select value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 Negotiation Date</option>
                <option value="02">02 Acceptance Date</option>
                <option value="03">03 Fixed Maturity Date</option>
              </select>
            </Field>
            <Field label="Other Charges" size="num">
              <div className="compound">
                <input
                  className="num-input"
                  placeholder="0.00"
                  readOnly
                  title="Grand total from the Charges breakdown"
                  value={form.otherCharges}
                />
                <button type="button" className="btn icon-only" title="Other Charges breakdown" onClick={onOpenCharges}>
                  <svg viewBox="0 0 24 24">
                    <path d="M4 4h16v2H4V4zm0 7h16v2H4v-2zm0 7h16v2H4v-2z" />
                  </svg>
                </button>
              </div>
            </Field>
            <Field label="BL Type" htmlFor="bl">
              <select id="bl" value={form.bl} onChange={(e) => set('bl', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 Original Copy</option>
                <option value="02">02 Copy BL</option>
              </select>
            </Field>
            <Field label="LC Applicant" size="code">
              <input maxLength={10} value={form.lcApplicant} onChange={(e) => onApplicantChange(e.target.value)} />
            </Field>
            <Field label="LC Beneficiary" size="code">
              <input maxLength={10} value={form.lcBeneficiary} onChange={(e) => set('lcBeneficiary', e.target.value)} />
            </Field>
            <Field label="Company Code" required>
              <div className="compound">
                <input className="code" maxLength={4} value={form.coCode} onChange={(e) => set('coCode', e.target.value)} />
                <input placeholder="(auto)" readOnly value={form.coCodeName} />
              </div>
            </Field>
            <Field label="Business Area">
              <div className="compound">
                <input className="code" maxLength={4} placeholder="(auto)" readOnly value={form.businessAreaCode} />
                <input placeholder="(auto)" readOnly value={form.businessAreaName} />
              </div>
            </Field>
          </Section>

          <Section title="Deposit / Prepayment">
            <Field label={prepay ? 'Prepayment Value' : 'Deposit Value'}>
              <select value={form.depositValue} onChange={(e) => set('depositValue', e.target.value)}>
                <option value="">Select</option>
                <option value="DTY">DTY — Discounted Value</option>
                <option value="STR">STR — Full Value</option>
              </select>
            </Field>
            <Field label={prepay ? 'Prepayment Amount' : 'Deposit Amount'}>
              <div className="compound">
                <input
                  {...amountProps('depositAmount')}
                  placeholder="e.g. 50K"
                  title="Enter a number or use K, M, B, T (example: 50K)"
                />
                <select
                  className="suffix"
                  value={form.depositAmountCcy}
                  onChange={(e) => set('depositAmountCcy', e.target.value)}
                >
                  {CCY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Expected Date">
              <DateInput aria-label="Expected Date" value={form.depositDate} onChange={(v) => set('depositDate', v)} />
            </Field>
            <Field label="Interest Category">
              <select
                value={form.interestCategory}
                onChange={(e) => onFormChange(applyInterestCategory(form, e.target.value))}
              >
                <option value="">Select</option>
                <option value="01">01 Fixed</option>
                <option value="02">02 Variable</option>
                <option value="03">03 Fixed with Benchmark</option>
                <option value="04">04 Bank COF</option>
              </select>
            </Field>
            <Field label="Interest Rate" size="num" hidden={!fixed}>
              <input
                className="num-input"
                inputMode="decimal"
                placeholder="0.00"
                value={form.interestRate}
                onChange={(e) => set('interestRate', e.target.value)}
                onBlur={(e) => {
                  const n = Number(e.target.value.trim())
                  if (e.target.value.trim() !== '' && Number.isFinite(n)) set('interestRate', n.toFixed(5))
                }}
              />
            </Field>
            <Field label="Ref Int Rate" hidden={fixed}>
              <select value={form.refIntRate} onChange={(e) => set('refIntRate', e.target.value)}>
                <option value="">Select</option>
                {lookups.refInts.map((r) => (
                  <option key={r.ZrefInt} value={r.ZrefInt}>
                    {r.ZrefInt}
                    {r.ZrefDesc ? ` — ${r.ZrefDesc}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Spread Rate" hidden={fixed}>
              <input
                className="num-input"
                inputMode="decimal"
                placeholder="0.00"
                value={form.spreadRate}
                onChange={(e) => set('spreadRate', e.target.value)}
              />
            </Field>
            <Field label="1st Interest Date" size="date">
              <DateInput
                aria-label="1st Interest Date"
                value={form.firstInterestDate}
                onChange={(v) => set('firstInterestDate', v)}
              />
            </Field>
            <Field label="Reset Frequency">
              <select value={form.resetFrequency} onChange={(e) => set('resetFrequency', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 Monthly</option>
                <option value="02">02 Quarterly</option>
                <option value="03">03 Half Yearly</option>
              </select>
            </Field>
            <Field label="Interest Frequency">
              <select value={form.interestFrequency} onChange={(e) => set('interestFrequency', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 Upfront</option>
                <option value="02">02 Monthly</option>
                <option value="03">03 Quarterly</option>
                <option value="04">04 Half-yearly</option>
                <option value="05">05 Rear-end</option>
              </select>
            </Field>
          </Section>

          <Section title="Commercial Summary">
            <Field label="Expected P&L %" size="num">
              <input
                className="num-input"
                inputMode="decimal"
                placeholder="0.00"
                value={form.expectedPLPercent}
                onChange={(e) => set('expectedPLPercent', e.target.value)}
              />
            </Field>
            <Field label="Expected P&L Amt">
              <input
                {...amountProps('expectedPLAmt')}
                placeholder="e.g. 100K"
                title="Enter a number or use K, M, B, T (example: 100K)"
              />
            </Field>
            <Field label="Remarks / Flow remark">
              <input maxLength={255} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
            </Field>
          </Section>

          <Section title="Contact & Commitment">
            <Field label="Bank Contact">
              <input maxLength={255} value={form.bankContact} onChange={(e) => set('bankContact', e.target.value)} />
            </Field>
            <Field label="Bank Contact Details">
              <input
                maxLength={255}
                value={form.bankContactDetails}
                onChange={(e) => set('bankContactDetails', e.target.value)}
              />
            </Field>
            <Field label="Commitment End Date">
              <DateInput
                aria-label="Commitment End Date"
                value={form.commitmentEndDate}
                onChange={(v) => set('commitmentEndDate', v)}
              />
            </Field>
          </Section>
        </div>

        <div className="modal-footer">
          <span className="modal-note">
            <b>*</b> Company Code is required before creation.
          </span>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClear}>
              Clear
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={onSave}>
              {mode === 'edit' ? 'Update OTTK' : 'Create OTTK'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function withCoCode(form: OttkForm, applicant: string, coCodes: readonly CoCodeRow[]): OttkForm {
  if (!applicant.trim()) return form
  const match = coCodes.find((c) => (c.ZcomId ?? '').toUpperCase() === applicant.trim().toUpperCase())
  if (!match) return form
  return { ...form, coCode: match.Zbukrs ?? '', coCodeName: match.Butxt ?? '' }
}
