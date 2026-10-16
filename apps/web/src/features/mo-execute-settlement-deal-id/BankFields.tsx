import { useEffect, useState } from 'react'
import { EMPTY_BANK_CHOICES, loadBankChoices, type BankChoices, type BankCompany } from './bankChoices.ts'
import { isAbort } from '../../shared/fx/mw.ts'

export function useBankChoices(open: boolean, company: string, businessPartner = '') {
  const key = JSON.stringify([company, businessPartner])
  const [state, setState] = useState<{ key: string; choices: BankChoices; loading: boolean }>({ key: '', choices: EMPTY_BANK_CHOICES, loading: false })
  useEffect(() => {
    if (!open || !company) return
    const controller = new AbortController()
    setState({ key, choices: EMPTY_BANK_CHOICES, loading: true })
    void loadBankChoices(company, businessPartner, controller.signal).then(
      (choices) => { if (!controller.signal.aborted) setState({ key, choices, loading: false }) },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error)) setState({ key, choices: { ...EMPTY_BANK_CHOICES, accountError: 'Bank accounts could not be loaded.' }, loading: false })
      },
    )
    return () => controller.abort()
  }, [open, company, businessPartner, key])
  return open && company && state.key === key ? state : { key, choices: EMPTY_BANK_CHOICES, loading: open && !!company }
}

export function CompanyField({ id, label, value, companies, onChange }: { id: string; label: string; value: string; companies: readonly BankCompany[]; onChange: (value: string) => void }) {
  return <div className="ffield">
    <label htmlFor={id}>{label}</label>
    {!companies.length ? <input id={id} maxLength={4} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} /> : <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select company...</option>
      {value && !companies.some((c) => c.code === value) ? <option value={value}>{value}</option> : null}
      {companies.map((c) => <option key={c.code} value={c.code}>{[c.code, c.name].filter(Boolean).join(' · ')}</option>)}
    </select>}
  </div>
}

export function HouseBankFields({ id, company, houseBank, accountId, choices, loading, disabled = false, onBank, onAccount }: {
  id: string; company: string; houseBank: string; accountId: string; choices: BankChoices; loading: boolean; disabled?: boolean
  onBank: (value: string) => void; onAccount: (value: string) => void
}) {
  const banks = [...new Map(choices.accounts.map((r) => [r.houseBank, r.bankName])).entries()]
  const accounts = choices.accounts.filter((r) => r.houseBank === houseBank)
  const selected = accounts.find((r) => r.accountId === accountId)
  const locked = disabled || loading || !company || !!choices.accountError
  return <>
    <div className="ffield">
      <label htmlFor={`${id}-house-bank`}>House Bank</label>
      <select id={`${id}-house-bank`} value={houseBank} disabled={locked} onChange={(e) => onBank(e.target.value)}>
        <option value="">{loading ? 'Loading banks...' : 'Select house bank...'}</option>
        {houseBank && !banks.some(([bank]) => bank === houseBank) ? <option value={houseBank} disabled>{houseBank} · saved value</option> : null}
        {banks.map(([bank, name]) => <option key={bank} value={bank}>{[bank, name].filter(Boolean).join(' · ')}</option>)}
      </select>
    </div>
    <div className="ffield">
      <label htmlFor={`${id}-account`}>Account ID</label>
      <select id={`${id}-account`} value={accountId} disabled={locked || !houseBank} onChange={(e) => onAccount(e.target.value)}>
        <option value="">Select account...</option>
        {accountId && !selected ? <option value={accountId} disabled>{accountId} · saved value</option> : null}
        {accounts.map((r) => <option key={r.accountId} value={r.accountId}>{[r.accountId, r.currency, r.description].filter(Boolean).join(' · ')}</option>)}
      </select>
    </div>
    <div className="ffield">
      <label htmlFor={`${id}-gl`}>Bank G/L</label>
      <input id={`${id}-gl`} readOnly value={selected?.glAccount ?? ''} placeholder={selected ? 'No G/L assigned' : 'Select a bank account'} />
    </div>
    {!disabled && (!company || choices.accountError || (!loading && !choices.accounts.length)) ? <p className="bank-help" role="status">{!company ? 'Select a company code to list its bank accounts.' : choices.accountError || `No bank accounts are available for company ${company}.`}</p> : null}
  </>
}

export function PartnerBankField({ id, value, choices, loading, onChange }: { id: string; value: string; choices: BankChoices; loading: boolean; onChange: (value: string) => void }) {
  return <div className="ffield">
    <label htmlFor={id}>Payment ID (company BP bank)</label>
    {choices.partnerError ? <input id={id} maxLength={4} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} /> : <select id={id} value={value} disabled={loading} onChange={(e) => onChange(e.target.value)}>
      <option value="">{loading ? 'Loading bank details...' : 'Select BP bank details...'}</option>
      {value && !choices.partnerBanks.some((r) => r.bankId === value) ? <option value={value} disabled>{value} · saved value</option> : null}
      {choices.partnerBanks.map((r) => <option key={r.bankId} value={r.bankId}>{[r.bankId, r.bankName].filter(Boolean).join(' · ')}</option>)}
    </select>}
    {choices.partnerError ? <span className="bank-help">{choices.partnerError}</span> : null}
  </div>
}
