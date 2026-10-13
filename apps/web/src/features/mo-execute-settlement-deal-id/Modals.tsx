import type { HouseBankAccount } from '../../shared/fx/house-bank.ts'
import { OPTIONS_WAITING } from './api.ts'
import { formatAmount } from './format.ts'
import { plAmount } from './logic.ts'
import type { DiffRow } from './invoiceDifference.ts'
import { ModalFrame } from './modal.tsx'
import type { FxDeal, FxPostForm, Headsup, InvPostForm, TradeInvoice } from './types.ts'

type Base = { open: boolean; onClose: () => void }

/**
 * Bank type and transfer type had hard-coded lists. Their SAP value helps
 * (ZSGTSFTR_SET_FX / T012) are not exported, so they say so.
 */
const gatedOptions = <option value="">{OPTIONS_WAITING}</option>

/** One empty-state row spanning the table. */
const EmptyRow = ({ span, text }: { span: number; text: string }) => (
  <tr className="empty-row">
    <td colSpan={span}>{text}</td>
  </tr>
)

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
}: Base & { dealId: string; items: readonly Headsup[]; emptyText: string }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#128276;</>}
      title="Heads Up"
      subtitle={<>Reminders for Deal ID <span>{dealId}</span></>}
      footer={<Cancel onClick={onClose} label="Close" />}
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Date</th>
              <th className="left">Category</th>
              <th className="left">Message</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={3}>{emptyText}</td>
              </tr>
            ) : (
              items.map((h) => (
                <tr key={`${h.date}-${h.cat}`}>
                  <td className="left">{h.date}</td>
                  <td className="left">{h.cat}</td>
                  <td className="left">{h.msg}</td>
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
}: Base & {
  row: FxDeal | undefined
  form: FxPostForm
  onField: <K extends keyof FxPostForm>(key: K, value: FxPostForm[K]) => void
  onAction: (kind: PostKind) => void
}) {
  const bankOptions = gatedOptions
  const trfOptions = gatedOptions
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
          <button className="action-btn" type="button" onClick={() => onAction('update')}>
            Update
          </button>
          <button className="btn-confirm green" type="button" onClick={() => onAction('complete')}>
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
          <div className="ffield">
            <label>Rec Co Code</label>
            <input type="text" maxLength={4} value={form.bRecCoCode} onChange={(e) => onField('bRecCoCode', e.target.value.toUpperCase())} />
          </div>
          <div className="ffield">
            <label>Receiving Bank ID</label>
            <input type="text" maxLength={5} value={form.bBankId} onChange={(e) => onField('bBankId', e.target.value.toUpperCase())} />
          </div>
          <div className="ffield">
            <label>Payment ID</label>
            <input type="text" maxLength={4} value={form.bPaymentId} onChange={(e) => onField('bPaymentId', e.target.value.toUpperCase())} />
          </div>
          <div className="ffield">
            <label>House Bank</label>
            <input type="text" disabled readOnly value={form.bHouseBank} />
          </div>
          <div className="ffield">
            <label>Account ID</label>
            <input type="text" disabled readOnly value={form.bAccountId} />
          </div>
          <div className="ffield">
            <label>Letter Code</label>
            <input type="text" disabled readOnly value={[form.letterCode, form.letterName].filter(Boolean).join(' - ')} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.subNo} onChange={(e) => onField('subNo', e.target.checked)} /> Print SSI
          Letter with Sub Account Number
        </label>
      </div>
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
            <label>Paying Bank ID</label>
            <input
              type="text"
              maxLength={5}
              disabled={form.remit}
              value={form.remit ? '' : form.sBankId}
              onChange={(e) => onField('sBankId', e.target.value.toUpperCase())}
            />
          </div>
          <div className="ffield">
            <label>Pay Co Code</label>
            <input type="text" maxLength={4} value={form.sPayCoCode} onChange={(e) => onField('sPayCoCode', e.target.value.toUpperCase())} />
          </div>
          <div className="ffield">
            <label>Payment ID</label>
            <input type="text" maxLength={4} value={form.sPaymentId} onChange={(e) => onField('sPaymentId', e.target.value.toUpperCase())} />
          </div>
          <div className="ffield">
            <label>House Bank</label>
            <input type="text" disabled readOnly value={form.sHouseBank} />
          </div>
          <div className="ffield">
            <label>Account ID</label>
            <input type="text" disabled readOnly value={form.sAccountId} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.remit} onChange={(e) => onField('remit', e.target.checked)} /> I will
          Remit to You
        </label>
      </div>
      <div className="note-box">
        {row ? (
          <>
            <strong>Settlement Complete:</strong> {row.settled ? 'Yes' : 'No'} (VTBFHA ZTSF_EXE_CO). House Bank and Account
            ID are derived in SAP from the pay IDs (VTBSTC1), which this app cannot read: they show what the transaction
            holds. The accounting entries are posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081).
          </>
        ) : null}
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
  houseBanks = [],
  companyOf = () => '',
}: Base & {
  row: TradeInvoice | undefined
  legLabel: string
  form: InvPostForm
  onField: <K extends keyof InvPostForm>(key: K, value: InvPostForm[K]) => void
  onAction: (kind: Exclude<PostKind, 'print'>) => void
  /** HouseBankAccount (ZFS_SB_HBKACCT_O4_API): suggestions only, the fields stay editable. */
  houseBanks?: readonly HouseBankAccount[]
  /** The company code of an entity (ZSGTSFTR_COMP), so each side is offered its own company's accounts. */
  companyOf?: (entity: string) => string
}) {
  const accountsOf = (entity: string) => {
    const company = companyOf(entity)
    return houseBanks.filter((b) => !company || b.companyCode === company)
  }
  const bankSuggestions = (entity: string) => {
    const seen = new Map<string, string>()
    for (const b of accountsOf(entity)) if (!seen.has(b.houseBank)) seen.set(b.houseBank, b.bankName)
    return [...seen].map(([bank, name]) => <option key={bank} value={bank}>{name}</option>)
  }
  const accountSuggestions = (entity: string, bank: string) =>
    accountsOf(entity)
      .filter((b) => !bank.trim() || b.houseBank === bank.trim().toUpperCase())
      .map((b) => (
        <option key={`${b.companyCode}|${b.houseBank}|${b.accountId}`} value={b.accountId}>
          {[b.houseBank, b.currency, b.description].filter(Boolean).join(' · ')}
        </option>
      ))
  // modify_screen_9002: a Receipt leg's bank fields are display only; once posted, so are the receiver's.
  const receipt = row?.recPay === 'Receipt'
  const senderLocked = receipt
  const receiverLocked = receipt || !!row?.fiDoc
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#129534;</>}
      title={<>Trade Invoice Settlement</>}
      subtitle={<>Invoice leg <span>{legLabel}</span> &ndash; maintain the banking details and settle the leg</>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="action-btn" type="button" onClick={() => onAction('update')}>
            Update
          </button>
          <button className="btn-confirm green" type="button" onClick={() => onAction('complete')}>
            Settlement Complete
          </button>
        </>
      }
    >
      <div className="form-grid">
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
      <div className="fbox" style={{ marginTop: '12px' }}>
        <div className="fbox-title">Sender / Receiver Details</div>
        <div className="form-grid">
          <div className="ffield">
            <label>Sender / Payer</label>
            <input type="text" disabled readOnly value={form.sender} />
          </div>
          <div className="ffield">
            <label>House Bank</label>
            <input type="text" maxLength={5} list="inv-sender-banks" disabled={senderLocked} value={form.senderHouseBank} onChange={(e) => onField('senderHouseBank', e.target.value)} />
            <datalist id="inv-sender-banks">{bankSuggestions(form.sender)}</datalist>
          </div>
          <div className="ffield">
            <label>Account ID</label>
            <input type="text" maxLength={5} list="inv-sender-accounts" disabled={senderLocked} value={form.senderAccountId} onChange={(e) => onField('senderAccountId', e.target.value)} />
            <datalist id="inv-sender-accounts">{accountSuggestions(form.sender, form.senderHouseBank)}</datalist>
          </div>
          <div className="ffield">
            <label>Receiver / Payee</label>
            <input type="text" disabled readOnly value={form.receiver} />
          </div>
          <div className="ffield">
            <label>House Bank</label>
            <input type="text" maxLength={5} list="inv-receiver-banks" disabled={receiverLocked} value={form.receiverHouseBank} onChange={(e) => onField('receiverHouseBank', e.target.value)} />
            <datalist id="inv-receiver-banks">{bankSuggestions(form.receiver)}</datalist>
          </div>
          <div className="ffield">
            <label>Account ID</label>
            <input type="text" maxLength={5} list="inv-receiver-accounts" disabled={receiverLocked} value={form.receiverAccountId} onChange={(e) => onField('receiverAccountId', e.target.value)} />
            <datalist id="inv-receiver-accounts">{accountSuggestions(form.receiver, form.receiverHouseBank)}</datalist>
          </div>
          {row?.partnerBank ? (
            <div className="ffield">
              <label>Partner Bank (Generate Invoices)</label>
              <input type="text" disabled readOnly value={row.businessPartner ? `${row.partnerBank} · BP ${row.businessPartner}` : row.partnerBank} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="ffield" style={{ marginTop: '12px' }}>
        <label>Doc Msg</label>
        <textarea
          rows={2}
          placeholder="posting narration"
          value={form.docMsg}
          onChange={(e) => onField('docMsg', e.target.value)}
        />
      </div>
      <div className="note-box">
        {row ? (
          <>
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
