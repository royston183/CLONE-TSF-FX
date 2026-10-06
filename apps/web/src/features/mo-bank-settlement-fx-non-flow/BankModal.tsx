import { useState } from 'react'
import { HOUSE_BANK_WAITING, TRANSFER_TYPE_WAITING } from './api.ts'
import { fmtNum } from './format.ts'
import { accountOptions, bankCandidates, transferTypeOf } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { BankForm, Deal, HouseBanks, UpdateLogEntry } from './types.ts'

/** T012 / T012K / T012T are not served (see api.ts): no house bank or account can be offered. */
const HOUSE_BANKS: HouseBanks = {}
/** VTBFHA-ZTSF_TRFTYPE is not served: transferTypeOf shows a dash. */
const TRANSFER_TYPES: Record<string, string> = {}

type Leg = {
  title: 'Incoming' | 'Outgoing'
  amt: number
  curr: string
  locked: boolean
  hb: string
  acc: string
  setHb: (v: string) => void
  setAcc: (v: string) => void
}

function LegBox({ leg, bukrs }: { leg: Leg; bukrs: string }) {
  const banks = bankCandidates(HOUSE_BANKS, bukrs, leg.curr)
  const accounts = accountOptions(HOUSE_BANKS, bukrs, leg.hb)
  return (
    <div className="assign-box" data-bukrs={bukrs} data-curr={leg.curr}>
      <div className="assign-box-title">{leg.title}</div>
      <div className="assign-field">
        <label>{leg.title} Amt / Ccy</label>
        <input type="text" readOnly value={`${fmtNum(leg.amt)} ${leg.curr}`} />
      </div>
      <div className="assign-field">
        <label>Transfer Type</label>
        <input type="text" readOnly value={transferTypeOf(TRANSFER_TYPES, leg.curr)} title={TRANSFER_TYPE_WAITING} />
      </div>
      <div className="assign-field">
        <label>House Bank</label>
        <select
          disabled={leg.locked}
          value={leg.hb}
          onChange={(e) => {
            leg.setHb(e.target.value)
            leg.setAcc('')
          }}
        >
          <option value="">Select...</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id} - {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="assign-field acc-field">
        <select disabled={leg.locked} value={leg.acc} onChange={(e) => leg.setAcc(e.target.value)}>
          <option value="">Select...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** The form + result log inside the popup; remounted (via key) each time the popup opens. */
function BankBody({
  deal,
  modal,
  onUpdate,
  onClosed,
}: {
  deal: Deal
  modal: Modal
  onUpdate: (form: BankForm) => UpdateLogEntry[]
  onClosed: () => void
}) {
  const [hb1, setHb1] = useState(deal.hb1 ?? '')
  const [acc1, setAcc1] = useState(deal.acc1 ?? '')
  const [hb2, setHb2] = useState(deal.hb2 ?? '')
  const [acc2, setAcc2] = useState(deal.acc2 ?? '')
  const [logs, setLogs] = useState<UpdateLogEntry[] | null>(null)
  const bothAssigned = deal.bankStatus === 'ASSIGNED'

  const submit = () => {
    const result = onUpdate({ hb1, acc1, hb2, acc2 })
    if (!result.length) modal.close()
    else setLogs(result)
  }

  if (logs) {
    return (
      <>
        <div className="modal-body" id="bank-body">
          <div className="section-label">Update Log</div>
          {logs.map((l) => (
            <div className="log-row" key={l.leg}>
              <span className={`log-light ${l.ok ? 'ok' : 'err'}`}></span>
              <span className="log-leg">{l.leg}</span>
              <span className="log-msg">{l.msg}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer" id="bank-footer">
          <button
            className="btn-confirm"
            type="button"
            onClick={() => {
              modal.close()
              onClosed()
            }}
          >
            Close
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="modal-body" id="bank-body">
        <div className="assign-grid">
          <LegBox
            bukrs={deal.bukrs}
            leg={{ title: 'Incoming', amt: deal.amt1, curr: deal.curr1, locked: !!deal.hb1, hb: hb1, acc: acc1, setHb: setHb1, setAcc: setAcc1 }}
          />
          <LegBox
            bukrs={deal.bukrs}
            leg={{ title: 'Outgoing', amt: deal.amt2, curr: deal.curr2, locked: !!deal.hb2, hb: hb2, acc: acc2, setHb: setHb2, setAcc: setAcc2 }}
          />
        </div>
        <div className="assign-note">
          {bothAssigned
            ? 'House bank & account are already assigned for both legs of this deal.'
            : HOUSE_BANK_WAITING}
        </div>
      </div>
      <div className="modal-footer" id="bank-footer">
        <button className="btn-cancel" type="button" onClick={modal.close}>
          Cancel
        </button>
        <button className="btn-confirm" type="button" id="bank-update-btn" disabled={bothAssigned} onClick={submit}>
          Update
        </button>
      </div>
    </>
  )
}

/** Assign House Bank & Account ID (popup screen 9002). */
export function BankModal({
  modal,
  deal,
  session,
  onUpdate,
  onClosed,
}: {
  modal: Modal
  deal: Deal | null
  /** Bumped on every open so the form starts from the deal's current values. */
  session: number
  onUpdate: (form: BankForm) => UpdateLogEntry[]
  /** The log's Close button: the page re-applies its filters. */
  onClosed: () => void
}) {
  return (
    <Overlay id="bank-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Assign House Bank &amp; Acc ID</div>
            <div className="modal-subtitle" id="bank-subtitle">
              {deal ? `Deal ${deal.dealId} · Txn ${deal.rfha} · ${deal.bukrs}` : ' '}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        {deal ? <BankBody key={session} deal={deal} modal={modal} onUpdate={onUpdate} onClosed={onClosed} /> : null}
      </div>
    </Overlay>
  )
}
