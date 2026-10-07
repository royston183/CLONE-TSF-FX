import { OPTIONS_WAITING } from './api.ts'
import { formatAmount } from './format.ts'
import { diff1Amount, plAmount } from './logic.ts'
import { ModalFrame } from './modal.tsx'
import type { DmsDoc, FxDeal, FxPostForm, Headsup, InvPostForm, TradeInvoice } from './types.ts'

type Base = { open: boolean; onClose: () => void }

/**
 * Bank type, transfer type and DMS doc type had hard-coded lists. Their SAP value helps
 * (ZSGTSFTR_SET_FX / T012 / ZSGTSFTR_DEALDMS) are not exported, so they say so.
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
        <label htmlFor="amendDate">Deal End Date</label>
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
  spots,
  onSpot,
  onSave,
  saving = false,
  emptyText,
}: Base & {
  emptyText: string
  rows: readonly FxDeal[]
  spots: readonly string[]
  onSpot: (idx: number, value: string) => void
  onSave: () => void
  saving?: boolean
}) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="wide"
      icon={<>&Delta;</>}
      title={<>FX &ndash; Invoice Difference</>}
      subtitle="Compares the FX deal rate against the invoice rate for each leg, and lets the trader fix the spot rate"
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="btn-confirm" type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Booking Spot…' : 'Save Spot Data'}
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Deal Type</th>
              <th className="left">Action</th>
              <th>All-in Rate</th>
              <th>Strike</th>
              <th>Diff 1 Amt</th>
              <th>Diff 2 Amt</th>
              <th>Diff 3 Amt</th>
              <th className="left">Spot Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow span={8} text={emptyText} /> : null}
            {rows.map((r, idx) => (
              <tr key={r.rfha}>
                <td className="left">
                  <span className={`chip ${r.dealTypeChip}`}>{r.dealType}</span>
                </td>
                <td className="left">Action FX</td>
                <td className="num">{r.rate}</td>
                <td className="num">{r.spot}</td>
                <td className="num">{diff1Amount(r)}</td>
                <td className="num">0.00</td>
                <td className="num">0.00</td>
                <td className="left">
                  <input
                    type="text"
                    className="diffSpotInput"
                    value={spots[idx] ?? r.spot}
                    onChange={(e) => onSpot(idx, e.target.value)}
                    style={{
                      width: '90px',
                      height: '28px',
                      border: '1px solid #CBD9E8',
                      borderRadius: '6px',
                      padding: '0 8px',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note-box">
        Enter the fixed spot conversion rate for each leg, then <strong>Save Spot Data</strong>. This rate feeds the +/-
        difference used when the trade invoice is finalised.
      </div>
    </ModalFrame>
  )
}

// ------------------------------------------------------------------ DMS viewer + Edit DMS (9007)

export function DmsModal({
  open,
  onClose,
  dealId,
  docs,
  onEdit,
  emptyText,
}: Base & { dealId: string; docs: readonly DmsDoc[]; onEdit: () => void; emptyText: string }) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#128193;</>}
      title={<>DMS &ndash; Deal Documents</>}
      subtitle={<>Documents filed against Deal ID <span>{dealId}</span></>}
      footer={
        <>
          <Cancel onClick={onClose} label="Close" />
          <button className="btn-confirm" type="button" onClick={onEdit}>
            Edit DMS
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">Document Type</th>
              <th className="left">File</th>
              <th className="left">Uploaded On</th>
              <th className="left">Uploaded By</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>{emptyText}</td>
              </tr>
            ) : (
              docs.map((d, i) => (
                <tr key={`${d.file}-${i}`}>
                  <td className="left">{d.type}</td>
                  <td className="left">{d.file}</td>
                  <td className="left">{d.date}</td>
                  <td className="left">{d.by}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ModalFrame>
  )
}

export function EditDmsModal({
  open,
  onClose,
  dealId,
  docType,
  date,
  onDocType,
  onDate,
  onConfirm,
}: Base & {
  dealId: string
  docType: string
  date: string
  onDocType: (v: string) => void
  onDate: (v: string) => void
  onConfirm: () => void
}) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      size="narrow"
      icon={<>&#9999;</>}
      title="Edit DMS"
      subtitle="Upload a document against this Deal ID"
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="btn-confirm" type="button" onClick={onConfirm}>
            Confirm
          </button>
        </>
      }
    >
      <div className="ffield" style={{ marginBottom: '12px' }}>
        <label>Deal ID</label>
        <input id="editDmsDeal" type="text" disabled value={dealId} readOnly />
      </div>
      <div className="ffield" style={{ marginBottom: '12px' }}>
        <label htmlFor="editDmsType">Doc Type</label>
        <select id="editDmsType" value={docType} onChange={(e) => onDocType(e.target.value)}>
          {gatedOptions}
        </select>
      </div>
      <div className="ffield">
        <label htmlFor="editDmsDate">Date</label>
        <input
          id="editDmsDate"
          type="text"
          placeholder="dd-mm-yyyy"
          maxLength={10}
          value={date}
          onChange={(e) => onDate(e.target.value)}
        />
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

export type PostKind = 'test' | 'print' | 'update' | 'post' | 'complete'

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
      subtitle={<>Transaction <span>{form.rfha}</span> &ndash; post the buy &amp; sell legs of the FX deal to bank / accounting</>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="action-btn" type="button" onClick={() => onAction('test')}>
            Post Test Run
          </button>
          <button className="action-btn" type="button" onClick={() => onAction('print')}>
            Print Letters
          </button>
          <button className="action-btn" type="button" onClick={() => onAction('update')}>
            Update
          </button>
          <button className="action-btn" type="button" onClick={() => onAction('post')}>
            Post Accounting Entry
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
            <input
              type="text"
              placeholder="generated on posting"
              value={form.bDoc}
              onChange={(e) => onField('bDoc', e.target.value)}
            />
          </div>
          <div className="ffield">
            <label>Bank Type</label>
            <select value={form.bBankType} onChange={(e) => onField('bBankType', e.target.value)}>
              {bankOptions}
            </select>
          </div>
          <div className="ffield">
            <label>Transfer Type</label>
            <select value={form.bTrfType} onChange={(e) => onField('bTrfType', e.target.value)}>
              {trfOptions}
            </select>
          </div>
          <div className="ffield">
            <label>Receiving Bank ID</label>
            <input
              type="text"
              placeholder="e.g. BNK-1021"
              value={form.bBankId}
              onChange={(e) => onField('bBankId', e.target.value)}
            />
          </div>
          <div className="ffield">
            <label>House Bank / Account ID</label>
            <input
              type="text"
              placeholder="e.g. HB01 / 100234"
              value={form.bAcc}
              onChange={(e) => onField('bAcc', e.target.value)}
            />
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
            <input
              type="text"
              placeholder="generated on posting"
              value={form.sDoc}
              onChange={(e) => onField('sDoc', e.target.value)}
            />
          </div>
          <div className="ffield">
            <label>Bank Type</label>
            <select value={form.sBankType} onChange={(e) => onField('sBankType', e.target.value)}>
              {bankOptions}
            </select>
          </div>
          <div className="ffield">
            <label>Transfer Type</label>
            <select value={form.sTrfType} onChange={(e) => onField('sTrfType', e.target.value)}>
              {trfOptions}
            </select>
          </div>
          <div className="ffield">
            <label>Paying Bank ID</label>
            <input
              type="text"
              placeholder="e.g. BNK-2044"
              value={form.sBankId}
              onChange={(e) => onField('sBankId', e.target.value)}
            />
          </div>
          <div className="ffield">
            <label>House Bank / Account ID</label>
            <input
              type="text"
              placeholder="e.g. HB02 / 200551"
              value={form.sAcc}
              onChange={(e) => onField('sAcc', e.target.value)}
            />
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
            <strong>Current status:</strong> {row.status}. Use <em>Post Test Run</em> to simulate, then{' '}
            <em>Post Accounting Entry</em> to post both legs to FI, and <em>Settlement Complete</em> once both FI documents
            exist.
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
}: Base & {
  row: TradeInvoice | undefined
  legLabel: string
  form: InvPostForm
  onField: <K extends keyof InvPostForm>(key: K, value: InvPostForm[K]) => void
  onAction: (kind: Exclude<PostKind, 'test'>) => void
}) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      icon={<>&#129534;</>}
      title={<>Bank Settlement &ndash; Posting</>}
      subtitle={<>Invoice leg <span>{legLabel}</span> &ndash; generate the bank letter and post the accounting entry</>}
      footer={
        <>
          <Cancel onClick={onClose} />
          <button className="action-btn" type="button" onClick={() => onAction('print')}>
            Print Letters
          </button>
          <button className="action-btn" type="button" onClick={() => onAction('update')}>
            Update
          </button>
          <button className="action-btn" type="button" onClick={() => onAction('post')}>
            Post Document
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
          <label>Bank</label>
          <input type="text" disabled readOnly value={form.bank} />
        </div>
        <div className="ffield">
          <label>Sender / Payer</label>
          <input type="text" disabled readOnly value={form.sender} />
        </div>
        <div className="ffield">
          <label>Receiver / Payee</label>
          <input type="text" disabled readOnly value={form.receiver} />
        </div>
        <div className="ffield">
          <label>Invoice Amount</label>
          <input type="text" disabled readOnly value={form.amt} />
        </div>
        <div className="ffield">
          <label>FI Document No</label>
          <input
            type="text"
            placeholder="generated on posting"
            value={form.fiDoc}
            onChange={(e) => onField('fiDoc', e.target.value)}
          />
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
            <strong>Current status:</strong> {row.setCo ? 'Settled' : 'Open'}. The invoice and its linked FX deal are
            designed to settle on the same value date.
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
