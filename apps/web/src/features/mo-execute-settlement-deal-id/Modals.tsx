import { useEffect, useState } from 'react'
import { CompanyField, HouseBankFields, PartnerBankField, useBankChoices } from './BankFields.tsx'
import { InvoiceAccountingTable } from './AccountingPreview.tsx'
import { bankSelectionError, type BankCompany } from './bankChoices.ts'
import { formatAmount } from './format.ts'
import { invBankRequired, plAmount } from './logic.ts'
import type { DiffRow } from './invoiceDifference.ts'
import { ModalFrame } from './modal.tsx'
import type { FxDeal, FxPostForm, Headsup, InvPostForm, TradeInvoice } from './types.ts'

type Base = { open: boolean; onClose: () => void }

/** One empty-state row spanning the table. */
const EmptyRow = ({ span, text }: { span: number; text: string }) => (
  <tr className="empty-row">
    <td colSpan={span}>{text}</td>
  </tr>
)

/** The ALV "Accounting Details" / "Accounting Entry" grid of the SAP pop-up. The entries are BO's (ZSGTSFR081), so MO sees the columns and, until BO posts, no rows. */
const ACCOUNTING_COLUMNS = ['D', 'CoCode', 'Document Date', 'Posting Date', 'G/L Acct', 'GL Description', 'Payment Amt', 'Pay Curr', 'Profit Center', 'Bus. Area']

function AccountingTable({ title, columns, posted }: { title: string; columns: readonly string[]; posted: boolean }) {
  return (
    <div className="fbox" style={{ marginTop: '10px', marginBottom: 0 }}>
      <div className="fbox-title">{title}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <EmptyRow
              span={columns.length}
              text={posted ? 'Posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081) — the entries are not served to MO.' : 'No accounting entries yet: they are posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081).'}
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}

const Cancel = ({ onClick, label = 'Cancel' }: { onClick: () => void; label?: string }) => (
  <button className="btn-cancel" type="button" onClick={onClick}>
    {label}
  </button>
)

// ------------------------------------------------------------------ Amend Deal End Date (9005)

export function AmendModal({
  open,
  onClose,
  dealId,
  value,
  onChange,
  onUpdate,
}: Base & { dealId: string; value: string; onChange: (v: string) => void; onUpdate: () => void }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="narrow"
      icon={<>&#128197;</>}
      title="Amend Deal End Date"
      subtitle={<>Deal ID <span>{dealId}</span></>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="btn-confirm" type="button" onClick={onUpdate}>
            Update Deal End Date
          </button>
        </>
      }
    >
      <div className="ffield">
        <label htmlFor="amendDate">
          Deal End Date<span className="req">*</span>
        </label>
        <input
          id="amendDate"
          type="text"
          placeholder="dd-mm-yyyy"
          maxLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="note-box">
        Revising the end date here updates the revised end date on the Deal ID header and the posting date used for the
        trade invoice legs.
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ Headsup (9004)

export function HeadsupModal({
  open,
  onClose,
  dealId,
  items,
  emptyText,
  loading,
}: Base & { dealId: string; items: readonly Headsup[]; emptyText: string; loading: boolean }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#128276;</>}
      title="Heads Up"
      size="wide"
      subtitle={<>Invoice and FX settlement actions for Deal ID <span>{dealId}</span></>}
      footer={<Cancel onClick={onClose} label="Close" />}
    >
      <div className="table-wrap" aria-busy={loading}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Entity</th>
              <th className="left">Trade Type</th>
              <th>FX Deal Amount</th>
              <th>Final Invoice Amount</th>
              <th>Difference</th>
              <th className="left">Currency</th>
              <th className="left">Action FX</th>
            </tr>
          </thead>
          <tbody>
            {loading || items.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>{loading ? 'Loading Heads Up…' : emptyText}</td>
              </tr>
            ) : (
              items.map((h, index) => (
                <tr key={`${h.tradeType}-${index}`}>
                  <td className="left">{h.entity}</td>
                  <td className="left">{h.tradeType}</td>
                  <td>{formatAmount(h.dealAmount)}</td>
                  <td>{formatAmount(h.finalAmount)}</td>
                  <td>{formatAmount(h.difference)}</td>
                  <td className="left">{h.currency}</td>
                  <td className="left" style={{ whiteSpace: 'normal', minWidth: 180 }}>{h.action || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ FX-Invoice Difference (9006)

export function DiffModal({
  open,
  onClose,
  rows,
  loading,
  note,
  onSave,
  saving = false,
  emptyText,
}: Base & {
  emptyText: string
  rows: readonly DiffRow[]
  loading: boolean
  /** An optional table that could not be read. */
  note: string
  onSave: () => void
  saving?: boolean
}) {
  const amount = (v: number) => formatAmount(v)
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&Delta;</>}
      title={<>FX &ndash; Invoice Difference</>}
      subtitle="The planned and final invoice of each trade against the FX deal it maps to"
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="btn-confirm" type="button" onClick={onSave} disabled={saving || loading || rows.length === 0}>
            {saving ? 'Saving…' : 'Save Difference'}
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Trade</th>
              <th className="left">Curr</th>
              <th>Planned Amt</th>
              <th>Final Invoice Amt</th>
              <th className="left">Deal Type</th>
              <th>Deal Amt</th>
              <th>Difference</th>
              <th>Diff 2 Amt</th>
              <th className="left">Deal 3 Type</th>
              <th>Deal 3 Amt</th>
              <th>Diff 3 Amt</th>
              <th className="left">Spot Co.</th>
              <th className="left">B/S</th>
              <th className="left">Saved</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow span={14} text="Reading the invoices and the deals from SAP…" /> : null}
            {!loading && rows.length === 0 ? <EmptyRow span={14} text={emptyText} /> : null}
            {!loading &&
              rows.map((r) => (
                <tr key={r.ttype}>
                  <td className="left">{r.ttype}</td>
                  <td className="left">{r.invCurr}</td>
                  <td className="num">{amount(r.planAmt)}</td>
                  <td className="num">{amount(r.finalAmt)}</td>
                  <td className="left">{r.dealType || '—'}</td>
                  <td className="num">{amount(r.dealAmt)}</td>
                  <td className="num">{amount(r.diffAmt)}</td>
                  <td className="num">{amount(r.diff2Amt)}</td>
                  <td className="left">{r.deal3Type || '—'}</td>
                  <td className="num">{amount(r.deal3Amt)}</td>
                  <td className="num">{amount(r.diff3Amt)}</td>
                  <td className="left">{r.sbukrs || '—'}</td>
                  <td className="left">{r.bs || '—'}</td>
                  <td className="left">{r.saved ? 'Yes' : 'No'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="note-box">
        <strong>Save Difference</strong> records these rows in ZSGTSFTR_IN_SPOT (the original SPOT button). It books no
        transaction in SAP: the FO trader workbench reads the saved rows and creates the spot later. A row already saved for
        its deal type is not saved again, and a zero difference is saved as well.
        {note ? <> {note}</> : null}
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ View P&L (9008)

export function PlModal({
  open,
  onClose,
  fxDeals,
  currencyString,
  emptyText,
}: Base & { fxDeals: readonly FxDeal[]; currencyString: string; emptyText: string }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&#128202;</>}
      title="View P&L Amount"
      subtitle={<>Realised profit per FX leg &mdash; the risk-free spread locked in by trading the pair against itself</>}
      footer={<Cancel onClick={onClose} />}
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Currency Pair</th>
              <th className="left">Deal Type</th>
              <th className="left">Txn Date</th>
              <th className="left">Value Date</th>
              <th className="left">B/S 1</th>
              <th>Amount 1</th>
              <th className="left">B/S 2</th>
              <th>Amount 2</th>
              <th>Spot</th>
              <th>All-in Rate</th>
              <th className="left">Counterparty</th>
              <th>P&amp;L Amount</th>
              <th className="left">Curr</th>
            </tr>
          </thead>
          <tbody>
            {fxDeals.length === 0 ? <EmptyRow span={13} text={emptyText} /> : null}
            {fxDeals.map((r) => {
              const pl = plAmount(fxDeals, r)
              return (
                <tr key={r.rfha}>
                  <td className="left">{currencyString}</td>
                  <td className="left">
                    <span className={`chip ${r.dealTypeChip}`}>{r.dealType}</span>
                  </td>
                  <td className="left">{r.txnDate}</td>
                  <td className="left">{r.valDate}</td>
                  <td className="left">
                    {r.bs1} {r.curr1}
                  </td>
                  <td className="num">{formatAmount(r.amt1)}</td>
                  <td className="left">
                    {r.bs2} {r.curr2}
                  </td>
                  <td className="num">{formatAmount(r.amt2)}</td>
                  <td className="num">{r.spot}</td>
                  <td className="num">{r.rate}</td>
                  <td className="left">{r.bp}</td>
                  <td className="num">{pl === null ? <span className="mut">-</span> : formatAmount(pl)}</td>
                  <td className="left">{pl === null ? '' : r.curr1}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ View Trade Invoice

export function ViewInvModal({
  open,
  onClose,
  dealId,
  rows,
  emptyText,
}: Base & { dealId: string; rows: readonly TradeInvoice[]; emptyText: string }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&#128203;</>}
      title="View Trade Invoice"
      subtitle={<>ZSGTSF_RDEAL_ID_INV &ndash; read-only invoice list for Deal ID <span>{dealId}</span></>}
      footer={<Cancel onClick={onClose} label="Close" />}
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Leg</th>
              <th className="left">Entity Leg</th>
              <th className="left">Reference</th>
              <th>Invoice Amt</th>
              <th className="left">Curr</th>
              <th className="left">Due Date</th>
              <th className="left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow span={7} text={emptyText} /> : null}
            {rows.map((r) => (
              <tr key={r.leg}>
                <td className="left">
                  <span className="chip chip-t">{r.leg}</span>
                </td>
                <td className="left">{r.trfDesc}</td>
                <td className="left">{r.xblnr}</td>
                <td className="num">{formatAmount(r.invAmt)}</td>
                <td className="left">{r.curr}</td>
                <td className="left">{r.dueDate}</td>
                <td className="left">
                  {r.setCo ? <span className="chip chip-done">Settled</span> : <span className="chip chip-open">Open</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ Transactions Posting (9003)

/** MO settles only: the accounting posting is BO's (ZSGTSFR081), so neither pop-up has a posting action. */
export type PostKind = 'print' | 'update' | 'complete'

export function FxPostModal({
  open,
  onClose,
  row,
  form,
  onField,
  onAction,
  companies,
}: Base & {
  row: FxDeal | undefined
  form: FxPostForm
  onField: <K extends keyof FxPostForm>(key: K, value: FxPostForm[K]) => void
  onAction: (kind: PostKind) => void
  companies: readonly BankCompany[]
}) {
  const buy = useBankChoices(open, form.bRecCoCode, companies.find((c) => c.code === form.bRecCoCode)?.businessPartner)
  const sell = useBankChoices(open, form.sPayCoCode, companies.find((c) => c.code === form.sPayCoCode)?.businessPartner)
  const [error, setError] = useState('')
  useEffect(() => setError(''), [open, form])
  const submit = (kind: PostKind) => {
    const buyError = bankSelectionError(form.bRecCoCode, form.bHouseBank, form.bAccountId, buy.choices, buy.loading, row?.setFxBuy?.acc === '01')
    const sellError = form.remit ? '' : bankSelectionError(form.sPayCoCode, form.sHouseBank, form.sAccountId, sell.choices, sell.loading, row?.setFxSell?.acc === '01')
    if (buyError || sellError) { setError(`${buyError ? 'Buy' : 'Sell'} currency: ${buyError || sellError}`); return }
    setError('')
    onAction(kind)
  }
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&#128179;</>}
      title="Transaction Settlement"
      subtitle={<>Transaction <span>{form.rfha}</span> &ndash; settle the buy &amp; sell legs of the FX deal</>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="action-btn" type="button" onClick={() => onAction('print')}>
            Print Letters
          </button>
          <button className="action-btn" type="button" onClick={() => submit('update')}>
            Update
          </button>
          <button className="btn-confirm green" type="button" onClick={() => submit('complete')}>
            Settlement Complete
          </button>
        </>
      }
    >
      <div className="fbox">
        <div className="fbox-title">Basic Details</div>
        <div className="form-grid">
          <div className="ffield">
            <label>Company Code</label>
            <input type="text" disabled readOnly value={form.bukrs} />
          </div>
          <div className="ffield">
            <label>Sequence</label>
            <input type="text" disabled readOnly value={form.seq} />
          </div>
          <div className="ffield">
            <label>Transaction</label>
            <input type="text" disabled readOnly value={form.rfha} />
          </div>
          <div className="ffield">
            <label>Deal Type</label>
            <input type="text" disabled readOnly value={form.dealType} />
          </div>
          <div className="ffield">
            <label>Partner</label>
            <input type="text" disabled readOnly value={form.partner} />
          </div>
        </div>
      </div>
      <div className="fbox">
        <div className="fbox-title">Buy Currency</div>
        <div className="form-grid">
          <div className="ffield">
            <label>Buy Amount</label>
            <input type="text" disabled readOnly value={form.bAmt} />
          </div>
          <div className="ffield">
            <label>FI Document</label>
            <input type="text" disabled readOnly placeholder="posted by BO (ZSGTSFR081)" value={form.bDoc} />
          </div>
          <div className="ffield">
            <label>Bank Type</label>
            <input type="text" disabled readOnly value={form.bBankType} />
          </div>
          <div className="ffield">
            <label>Transfer Type</label>
            <input type="text" disabled readOnly value={form.bTrfType} />
          </div>
          <CompanyField id="fx-buy-company" label="Rec Co Code" value={form.bRecCoCode} companies={companies} onChange={(v) => onField('bRecCoCode', v)} />
          <div className="ffield">
            <label>Receiving Bank ID (instruction)</label>
            <input type="text" maxLength={10} value={form.bBankId} onChange={(e) => onField('bBankId', e.target.value.toUpperCase())} />
          </div>
          <PartnerBankField id="fx-buy-payment" value={form.bPaymentId} choices={buy.choices} loading={buy.loading} onChange={(v) => onField('bPaymentId', v)} />
          <HouseBankFields id="fx-buy" company={form.bRecCoCode} houseBank={form.bHouseBank} accountId={form.bAccountId} choices={buy.choices} loading={buy.loading} onBank={(v) => onField('bHouseBank', v)} onAccount={(v) => onField('bAccountId', v)} />
          <div className="ffield">
            <label>Letter Code</label>
            <input type="text" disabled readOnly value={[form.letterCode, form.letterName].filter(Boolean).join(' - ')} />
          </div>
          <div className="ffield">
            <label>Letter Desc</label>
            <input type="text" disabled readOnly value="" />
          </div>
          <div className="ffield">
            <label>Settlement Desc</label>
            <input type="text" disabled readOnly value={form.bSetDesc} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.subNo} onChange={(e) => onField('subNo', e.target.checked)} /> Print SSI
          Letter with Sub Account Number
        </label>
        <label className="check-row">
          <input type="checkbox" disabled readOnly checked={false} /> Beneficiary Address
        </label>
        <label className="check-row">
          <input type="checkbox" disabled readOnly checked={false} /> Purpose Code
        </label>
      </div>
      <AccountingTable title="Accounting Details (Buy)" columns={ACCOUNTING_COLUMNS} posted={!!form.bDoc} />
      <div className="fbox">
        <div className="fbox-title">Sell Currency</div>
        <div className="form-grid">
          <div className="ffield">
            <label>Sell Amount</label>
            <input type="text" disabled readOnly value={form.sAmt} />
          </div>
          <div className="ffield">
            <label>FI Document</label>
            <input type="text" disabled readOnly placeholder="posted by BO (ZSGTSFR081)" value={form.sDoc} />
          </div>
          <div className="ffield">
            <label>Bank Type</label>
            <input type="text" disabled readOnly value={form.sBankType} />
          </div>
          <div className="ffield">
            <label>Transfer Type</label>
            <input type="text" disabled readOnly value={form.sTrfType} />
          </div>
          <div className="ffield">
            <label>Paying Bank ID (instruction)</label>
            <input
              type="text"
              maxLength={10}
              disabled={form.remit}
              value={form.remit ? '' : form.sBankId}
              onChange={(e) => onField('sBankId', e.target.value.toUpperCase())}
            />
          </div>
          <CompanyField id="fx-sell-company" label="Pay Co Code" value={form.sPayCoCode} companies={companies} onChange={(v) => onField('sPayCoCode', v)} />
          <PartnerBankField id="fx-sell-payment" value={form.sPaymentId} choices={sell.choices} loading={sell.loading} onChange={(v) => onField('sPaymentId', v)} />
          <HouseBankFields id="fx-sell" company={form.sPayCoCode} houseBank={form.sHouseBank} accountId={form.sAccountId} choices={sell.choices} loading={sell.loading} disabled={form.remit} onBank={(v) => onField('sHouseBank', v)} onAccount={(v) => onField('sAccountId', v)} />
          <div className="ffield">
            <label>Letter Code</label>
            <input type="text" disabled readOnly value={form.sLetterCode} />
          </div>
          <div className="ffield">
            <label>Letter Desc</label>
            <input type="text" disabled readOnly value="" />
          </div>
          <div className="ffield">
            <label>Settlement Desc</label>
            <input type="text" disabled readOnly value={form.sSetDesc} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.remit} onChange={(e) => onField('remit', e.target.checked)} /> I will
          Remit to You
        </label>
      </div>
      <AccountingTable title="Accounting Details (Sell)" columns={ACCOUNTING_COLUMNS} posted={!!form.sDoc} />
      {error ? <div className="note-box" role="alert">{error}</div> : null}
      <div className="note-box">
        Select each side's house bank and account for its company code. Payment instruction IDs are maintained separately.
        Accounting entries are posted through BO: Post Accounting Entries for Settlement.
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ Posting Pop-up (9002)

export function InvPostModal({
  open,
  onClose,
  row,
  legLabel,
  form,
  onField,
  onAction,
  companyOf = () => '',
  rows = [],
  dealId = '',
}: Base & {
  row: TradeInvoice | undefined
  /** Every invoice leg, to find a Payment leg's paired Receipt leg. */
  rows?: readonly TradeInvoice[]
  dealId?: string
  legLabel: string
  form: InvPostForm
  onField: <K extends keyof InvPostForm>(key: K, value: InvPostForm[K]) => void
  onAction: (kind: Exclude<PostKind, 'print'>) => void
  /** The company code of an entity (ZSGTSFTR_COMP), so each side is offered its own company's accounts. */
  companyOf?: (entity: string) => string
}) {
  const senderCompany = companyOf(form.sender)
  const receiverCompany = companyOf(form.receiver)
  const sender = useBankChoices(open, senderCompany)
  const receiver = useBankChoices(open, receiverCompany)
  const [error, setError] = useState('')
  useEffect(() => setError(''), [open, form])
  // modify_screen_9002: a Receipt leg's bank fields are display only; once posted, so are the receiver's.
  const receipt = row?.recPay === 'Receipt'
  const senderLocked = receipt
  const receiverLocked = receipt || !!row?.fiDoc
  const required = invBankRequired(row, rows)
  const submit = (kind: Exclude<PostKind, 'print'>) => {
    const senderError = senderLocked ? '' : bankSelectionError(senderCompany, form.senderHouseBank, form.senderAccountId, sender.choices, sender.loading, required.sender)
    const receiverError = receiverLocked ? '' : bankSelectionError(receiverCompany, form.receiverHouseBank, form.receiverAccountId, receiver.choices, receiver.loading, required.receiver)
    if (senderError || receiverError) { setError(`${senderError ? 'Sender' : 'Receiver'}: ${senderError || receiverError}`); return }
    setError('')
    onAction(kind)
  }
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&#129534;</>}
      title={<>Trade Invoice Settlement</>}
      subtitle={<>Invoice leg <span>{legLabel}</span> &ndash; maintain the banking details and settle the leg</>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="action-btn" type="button" onClick={() => submit('update')}>
            Update
          </button>
          <button className="btn-confirm green" type="button" onClick={() => submit('complete')}>
            Settlement Complete
          </button>
        </>
      }
    >
      <div className="fbox" style={{ marginBottom: '10px' }}>
        <div className="fbox-title">Basic Details</div>
        <div className="form-grid three">
          <div className="ffield">
            <label>Company Code</label>
            <input type="text" disabled readOnly value={form.bukrs} />
          </div>
          <div className="ffield">
            <label>Sequence</label>
            <input type="text" disabled readOnly value={form.seq} />
          </div>
          <div className="ffield">
            <label>Receipt/Payment</label>
            <input type="text" disabled readOnly value={form.recPay} />
          </div>
          <div className="ffield">
            <label>Trade Type</label>
            <input type="text" disabled readOnly value={form.tradeType} />
          </div>
          <div className="ffield" style={{ gridColumn: 'span 2' }}>
            <label>Settlement Desc</label>
            <input type="text" disabled readOnly value={form.setDesc} />
          </div>
          <div className="ffield">
            <label>Payment Amount</label>
            <input type="text" disabled readOnly value={form.payAmt} />
          </div>
          <div className="ffield">
            <label>Premium Amount</label>
            <input type="text" disabled readOnly value="" />
          </div>
          <div className="ffield">
            <label>Linked FX Deal</label>
            <input type="text" disabled readOnly value={form.linkedFx} />
          </div>
          <div className="ffield">
            <label>Transfer Type</label>
            <input type="text" disabled readOnly value={form.trfType} />
          </div>
          <div className="ffield">
            <label>Posting Type</label>
            <input type="text" disabled readOnly value={form.postingType} />
          </div>
          <div className="ffield">
            <label>Letter Code</label>
            <input type="text" disabled readOnly value="" />
          </div>
          <div className="ffield">
            <label>Letter Desc</label>
            <input type="text" disabled readOnly value="" />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" disabled readOnly checked={form.settled} /> Settlement
        </label>
        <label className="check-row">
          <input type="checkbox" disabled readOnly checked={form.fiPosting} /> FI Posting
        </label>
      </div>
      <div className="form-grid three">
        <div className="ffield">
          <label>Value Date</label>
          <input type="text" disabled readOnly value={form.date} />
        </div>
        <div className="ffield">
          <label>Invoice Amount</label>
          <input type="text" disabled readOnly value={form.amt} />
        </div>
        <div className="ffield">
          <label>FI Document No</label>
          <input type="text" disabled readOnly placeholder="posted by BO (ZSGTSFR081)" value={form.fiDoc} />
        </div>
      </div>
      <div className="fbox" style={{ marginTop: '10px', marginBottom: 0 }}>
        <div className="fbox-title">Sender / Receiver Details</div>
        <div className="form-grid three">
          <div className="ffield bank-entity">
            <label>Sender / Payer {senderCompany ? `(${senderCompany})` : ''}</label>
            <input type="text" disabled readOnly value={form.sender} />
          </div>
          <HouseBankFields id="inv-sender" company={senderCompany} houseBank={form.senderHouseBank} accountId={form.senderAccountId} choices={sender.choices} loading={sender.loading} disabled={senderLocked} required={required.sender} onBank={(v) => onField('senderHouseBank', v)} onAccount={(v) => onField('senderAccountId', v)} />
          <div className="ffield bank-entity">
            <label>Receiver / Payee {receiverCompany ? `(${receiverCompany})` : ''}</label>
            <input type="text" disabled readOnly value={form.receiver} />
          </div>
          <HouseBankFields id="inv-receiver" company={receiverCompany} houseBank={form.receiverHouseBank} accountId={form.receiverAccountId} choices={receiver.choices} loading={receiver.loading} disabled={receiverLocked} required={required.receiver} onBank={(v) => onField('receiverHouseBank', v)} onAccount={(v) => onField('receiverAccountId', v)} />
          <div className="ffield">
            <label>Partner ID</label>
            <input type="text" disabled readOnly value={form.partnerId} />
          </div>
          {row?.partnerBank ? (
            <div className="ffield">
              <label>Partner Bank (Generate Invoices)</label>
              <input type="text" disabled readOnly value={row.businessPartner ? `${row.partnerBank} · BP ${row.businessPartner}` : row.partnerBank} />
            </div>
          ) : null}
        </div>
      </div>
      <InvoiceAccountingTable open={open} row={row} form={form} dealId={dealId} />
      <div className="ffield" style={{ marginTop: '10px' }}>
        <label>Doc Msg</label>
        <textarea
          rows={1}
          placeholder="posting narration"
          value={form.docMsg}
          onChange={(e) => onField('docMsg', e.target.value)}
        />
      </div>
      <div className="note-box">
        {row ? (
          <>
            {error ? <span role="alert">{error}<br /></span> : null}
            <strong>Settlement:</strong> {row.setCo ? 'Yes' : 'No'} &middot; <strong>Accounting posting:</strong>{' '}
            {row.fiDoc ? <>Yes ({row.fiDoc})</> : 'No'}. The posting is done on BO: Post Accounting Entries for Settlement
            (ZSGTSFR081).
          </>
        ) : null}
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ Letter preview (9001)

export function LetterModal({ open, onClose, text, onPrint }: Base & { text: string; onPrint: () => void }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#128196;</>}
      title="Bank Settlement Letter"
      subtitle="Print preview"
      footer={
        <>
          <Cancel onClick={onClose} label="Back" />
          <button className="btn-confirm" type="button" onClick={onPrint}>
            Print PDF
          </button>
        </>
      }
    >
      <div className="letter-preview">{text}</div>
    </ModalFrame>
  )
}
