import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { formatAmount, formatAmountWhileTyping, parseAmount } from '@slc/api-client'
import {
  applyBankSelection,
  applyEntitySelection,
  applyInterestCategory,
  applyOttkSelection,
  applyType2,
  hasConfirmationLeg,
  isFixedInterest,
  isTradeLocked,
  withCoCode,
} from './form.ts'
import type { DttkForm } from './form.ts'
import type { Lookups, OttkRow } from './types.ts'

export const CCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD']

export const STRUCTURE_OPTIONS = [
  { value: 'DSX', label: 'DSX — Deposit Set Off - Cross Border' },
  { value: 'LCP', label: 'LCP — LC Prepayment' },
  { value: 'CC DSX', label: 'CC DSX — Cross Currency DSX' },
  { value: 'CC LCP', label: 'CC LCP — Cross Currency LCP' },
]

export const TYPE1_OPTIONS = [
  { value: '01', label: '01 Discounting & Confirmation' },
  { value: '02', label: '02 Discounting Only' },
  { value: '03', label: '03 Confirmation Only' },
]

export const TYPE2_OPTIONS = [
  { value: '01', label: '01 New' },
  { value: '02', label: '02 With Ref OTTK' },
]

function Field({
  label,
  htmlFor,
  children,
  hidden,
  required,
  className = 'field',
}: {
  label?: ReactNode
  htmlFor?: string
  children: ReactNode
  hidden?: boolean
  /** Marks the label with a red asterisk; the save handler enforces the value. */
  required?: boolean
  className?: string
}) {
  return (
    <div className={className} hidden={hidden}>
      {label !== undefined ? (
        <label htmlFor={htmlFor}>
          {label}
          {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
    </div>
  )
}

function Section({ title, kind, children, hidden }: { title: string; kind: string; children: ReactNode; hidden?: boolean }) {
  return (
    <section className={`section ${kind}`} hidden={hidden}>
      <div className="section-title">{title}</div>
      <div className="fields">{children}</div>
    </section>
  )
}

export type DttkModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  editKey: string
  statusText: string
  createdBy: string
  form: DttkForm
  onFormChange: (form: DttkForm) => void
  lookups: Lookups
  ottkRows: readonly OttkRow[]
  amountErrors: Record<string, boolean>
  onOpenCharges: () => void
  onOpenConfCharges: () => void
  onClear: () => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}

/**
 * Create / Edit Distribution Ticket.
 *
 * Reproduces legacy/DTTK.html's #dttkModal element for element: the five `.section` blocks
 * with their sec-* classes (which the original stylesheet colours), the `.field-duo` pairs,
 * and the `.no-confirmation` grid modifier used when the Confirmation Bank section is hidden.
 */
export function DttkModal(props: DttkModalProps) {
  const {
    open,
    mode,
    editKey,
    statusText,
    createdBy,
    form,
    onFormChange,
    lookups,
    ottkRows,
    amountErrors,
    onOpenCharges,
    onOpenConfCharges,
    onClear,
    onClose,
    onSave,
    saving,
  } = props

  const type1Ref = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => type1Ref.current?.focus(), 80)
    document.body.classList.add('modal-open')
    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove('modal-open')
    }
  }, [open])

  const set = <K extends keyof DttkForm>(key: K, value: DttkForm[K]) => onFormChange({ ...form, [key]: value })

  const amountProps = (key: keyof DttkForm) => ({
    className: `fs-amount-input${amountErrors[key as string] ? ' field-error' : ''}`,
    inputMode: 'decimal' as const,
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      set(key, formatAmountWhileTyping(event.target.value) as DttkForm[typeof key]),
    onBlur: () => {
      const parsed = parseAmount(form[key])
      if (parsed !== null) set(key, formatAmount(parsed) as DttkForm[typeof key])
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
  })

  const fixed = isFixedInterest(form.interestCategory)
  const showConfirmation = hasConfirmationLeg(form.type1)
  const locked = isTradeLocked(form)

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
              <h2 id="modalTitle">
                {mode === 'edit' ? 'Edit Distribution Ticket' : 'Create Distribution Ticket'}
              </h2>
              <p id="modalSubtitle">
                {mode === 'edit'
                  ? `Distribution · Edit  |  DTTK #${editKey}  |  ${statusText}`
                  : 'Distribution · New  |  USD  |  Draft'}
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

        <div className={`modal-content-grid dttk-grid${showConfirmation ? '' : ' no-confirmation'}`}>
          <Section title="Transaction Details" kind="sec-basic">
            <Field label="DTTK Type 1" htmlFor="type1">
              <select id="type1" ref={type1Ref} value={form.type1} onChange={(e) => set('type1', e.target.value)}>
                <option value="">Select</option>
                {TYPE1_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="DTTK Type 2" htmlFor="type2">
              <select id="type2" value={form.type2} onChange={(e) => onFormChange(applyType2(form, e.target.value))}>
                {TYPE2_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Related OTTK" htmlFor="otkNo" hidden={form.type2 !== '02'}>
              <select
                id="otkNo"
                value={form.otkNo}
                onChange={(e) => onFormChange(applyOttkSelection(form, e.target.value, ottkRows, lookups.ottkBanks))}
              >
                <option value="">Select OTTK</option>
                {ottkRows.map((row) => (
                  <option key={row.ZottkNo} value={row.ZottkNo}>
                    {row.ZottkNo}
                    {row.ZentDesc ? ` — ${row.ZentDesc}` : ''}
                  </option>
                ))}
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
              <select
                id="entityCode"
                value={form.entityCode}
                onChange={(e) =>
                  onFormChange(applyEntitySelection(form, e.target.value, lookups.entities, lookups.coCodes))
                }
              >
                <option value="">Select entity</option>
                {lookups.entities.map((e) => (
                  <option key={e.ZentId} value={e.ZentId}>
                    {e.ZentId} — {e.ZentDesc}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Trade Details" kind="sec-trade">
            <Field label="Origination Bank" htmlFor="bank" className="field wide2">
              <select
                id="bank"
                disabled={locked}
                value={form.bank}
                onChange={(e) => onFormChange(applyBankSelection(form, e.target.value, lookups.ottkBanks))}
              >
                <option value="">Select bank</option>
                {lookups.ottkBanks.map((b) => (
                  <option key={b.Zbp} value={b.Zbp}>
                    {b.Zbp} — {b.BpName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="OTTK Trade Value">
              <div className="compound">
                <input
                  {...amountProps('otkValue')}
                  disabled={locked}
                  placeholder="e.g. 1.5M"
                  title="Enter a number or use K, M, B, T (example: 1.5M)"
                />
                <select
                  className="suffix"
                  disabled={locked}
                  value={form.otkValueCcy}
                  onChange={(e) => set('otkValueCcy', e.target.value)}
                >
                  {CCY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <div className="field field-duo">
              <div className="duo-item">
                <label htmlFor="lcdate">Expected LC Date</label>
                <input
                  id="lcdate"
                  type="date"
                  disabled={locked}
                  value={form.lcdate}
                  onChange={(e) => set('lcdate', e.target.value)}
                />
              </div>
              <div className="duo-item duo-narrow">
                <label htmlFor="tenor">Expected LC Tenor</label>
                <div className="compound">
                  <input
                    id="tenor"
                    className="short num-input"
                    placeholder="0"
                    inputMode="numeric"
                    maxLength={5}
                    disabled={locked}
                    value={form.tenor}
                    onChange={(e) => set('tenor', e.target.value)}
                  />
                  <span className="suffix">days</span>
                </div>
              </div>
            </div>
            <div className="field field-duo">
              <div className="duo-item">
                <label>LC Applicant</label>
                <input
                  maxLength={10}
                  disabled={locked}
                  value={form.lcApplicant}
                  onChange={(e) => onFormChange(withCoCode({ ...form, lcApplicant: e.target.value }, e.target.value, lookups.coCodes))}
                />
              </div>
              <div className="duo-item">
                <label>LC Beneficiary</label>
                <input
                  maxLength={10}
                  disabled={locked}
                  value={form.lcBeneficiary}
                  onChange={(e) => set('lcBeneficiary', e.target.value)}
                />
              </div>
            </div>
            <Field label="Company Code" required>
              <div className="compound">
                <input
                  className="code"
                  maxLength={4}
                  disabled={locked}
                  value={form.coCode}
                  onChange={(e) => set('coCode', e.target.value)}
                />
                <input placeholder="(auto)" readOnly disabled={locked} value={form.coCodeName} />
              </div>
            </Field>
            <Field label="Business Area">
              <div className="compound">
                <input className="code" maxLength={4} placeholder="(auto)" readOnly disabled={locked} value={form.businessAreaCode} />
                <input placeholder="(auto)" readOnly disabled={locked} value={form.businessAreaName} />
              </div>
            </Field>
            <Field label="RMA With Orig. Bank" htmlFor="rma">
              <select id="rma" disabled={locked} value={form.rma} onChange={(e) => set('rma', e.target.value)}>
                <option value="">Select</option>
                <option value="Y">Y Yes</option>
                <option value="N">N No</option>
              </select>
            </Field>
          </Section>

          <Section title="Discounting Loan Details" kind="sec-discounting">
            <Field label="Discounting Bank" htmlFor="disBank" className="field wide2">
              <select id="disBank" value={form.disBank} onChange={(e) => set('disBank', e.target.value)}>
                <option value="">Select bank</option>
                {lookups.dttkBanks.map((b) => (
                  <option key={b.Zbp} value={b.Zbp}>
                    {b.Zbp} — {b.BpName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="DTTK Trade Value">
              <div className="compound">
                <input
                  {...amountProps('tradeValue')}
                  disabled={locked}
                  placeholder="e.g. 1.5M"
                  title="Enter a number or use K, M, B, T (example: 1.5M)"
                />
                <select
                  className="suffix"
                  disabled={locked}
                  value={form.tradeValueCcy}
                  onChange={(e) => set('tradeValueCcy', e.target.value)}
                >
                  {CCY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Disc. Calc Method" htmlFor="disVal">
              <select id="disVal" value={form.disVal} onChange={(e) => set('disVal', e.target.value)}>
                <option value="">Select</option>
                <option value="DTY">DTY — Discounted Value</option>
                <option value="STR">STR — Full Value</option>
              </select>
            </Field>
            <Field label="Discounting Loan Amt">
              <div className="compound">
                <input {...amountProps('disAmt')} placeholder="e.g. 700K" />
                <select className="suffix" value={form.disCurr} onChange={(e) => set('disCurr', e.target.value)}>
                  {CCY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Discounting Rate" htmlFor="interestCategory">
              <select
                id="interestCategory"
                value={form.interestCategory}
                onChange={(e) => onFormChange(applyInterestCategory(form, e.target.value))}
              >
                <option value="01">01 Fixed</option>
                <option value="02">02 Floating</option>
              </select>
            </Field>
            <Field label="Interest Rate" hidden={!fixed}>
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
            <Field label="Interest Frequency" htmlFor="interestFrequency">
              <select
                id="interestFrequency"
                value={form.interestFrequency}
                onChange={(e) => set('interestFrequency', e.target.value)}
              >
                <option value="">Select</option>
                <option value="01">01 Upfront</option>
                <option value="02">02 Monthly</option>
                <option value="03">03 Quarterly</option>
                <option value="04">04 Half-yearly</option>
                <option value="05">05 Rear-end</option>
                <option value="06">06 NA</option>
              </select>
            </Field>
            <Field label="Negotiation Fee">
              <input {...amountProps('negFee')} placeholder="0.00" />
            </Field>
            <Field label="Other Charges">
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
            <Field label="Discounting Trader" htmlFor="dTrader">
              <select id="dTrader" value={form.dTrader} onChange={(e) => set('dTrader', e.target.value)}>
                <option value="">Select trader</option>
                {lookups.traders.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region">
              <input maxLength={10} value={form.region} onChange={(e) => set('region', e.target.value)} />
            </Field>
            <Field label="Discounting / Flow Remark">
              <input maxLength={255} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
            </Field>
          </Section>

          <Section title="Confirmation Bank" kind="sec-confirmation" hidden={!showConfirmation}>
            <Field label="Confirmation Bank" htmlFor="cbank" className="field wide2">
              <select id="cbank" value={form.cbank} onChange={(e) => set('cbank', e.target.value)}>
                <option value="">Select bank</option>
                {lookups.dttkBanks.map((b) => (
                  <option key={b.Zbp} value={b.Zbp}>
                    {b.Zbp} — {b.BpName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Conf. Fee From" htmlFor="cfeeFrom">
              <select id="cfeeFrom" value={form.cfeeFrom} onChange={(e) => set('cfeeFrom', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 Issuance Date</option>
                <option value="02">02 Confirmation Date</option>
              </select>
            </Field>
            <Field label="Conf. Fee Till" htmlFor="cfeeTo">
              <select id="cfeeTo" value={form.cfeeTo} onChange={(e) => set('cfeeTo', e.target.value)}>
                <option value="">Select</option>
                <option value="01">01 LC Maturity Date</option>
                <option value="02">02 Document Presentation Date</option>
              </select>
            </Field>
            <Field label="Confirmation Trader" htmlFor="cTrader">
              <select id="cTrader" value={form.cTrader} onChange={(e) => set('cTrader', e.target.value)}>
                <option value="">Select trader</option>
                {lookups.traders.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Confirmation Fee">
              <div className="compound">
                <input
                  className="num-input"
                  placeholder="0.00"
                  readOnly
                  title="Grand total from the Confirmation Fee breakdown"
                  value={form.confirmationFee}
                />
                <button
                  type="button"
                  className="btn icon-only"
                  title="Confirmation Fee breakdown"
                  onClick={onOpenConfCharges}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M4 4h16v2H4V4zm0 7h16v2H4v-2zm0 7h16v2H4v-2z" />
                  </svg>
                </button>
              </div>
            </Field>
            <Field label="Confirmation Remark">
              <input maxLength={255} value={form.cremark} onChange={(e) => set('cremark', e.target.value)} />
            </Field>
          </Section>

          <Section title="Additional Information" kind="sec-additional">
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
              <input
                type="date"
                value={form.commitmentEndDate}
                onChange={(e) => set('commitmentEndDate', e.target.value)}
              />
            </Field>
            <Field label="Commitment Fee">
              <input {...amountProps('commitmentFee')} placeholder="0.00" />
            </Field>
            <Field label="Reservation Start Date">
              <input
                type="date"
                value={form.reservationStartDate}
                onChange={(e) => set('reservationStartDate', e.target.value)}
              />
            </Field>
            <Field label="LC Issuance Latest Date">
              <input type="date" value={form.lcIssuanceDate} onChange={(e) => set('lcIssuanceDate', e.target.value)} />
            </Field>
            <Field label="Doc Pres. Latest Date">
              <input type="date" value={form.docPresDate} onChange={(e) => set('docPresDate', e.target.value)} />
            </Field>
            <Field label="Repay. of Prev LC Date">
              <input
                type="date"
                value={form.repayPrevLcDate}
                onChange={(e) => set('repayPrevLcDate', e.target.value)}
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
              {mode === 'edit' ? 'Update DTTK' : 'Create DTTK'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
