import { useEffect, useRef, type CSSProperties } from 'react'
import { fmtAmt } from './format.ts'
import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import { AlertCircleIcon } from './icons.tsx'
import { Overlay, type Modal } from './modal.tsx'
import type { Field, MasterContract, TopRow } from './types.ts'

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="modal-head">
      <h3>{title}</h3>
      <button type="button" className="modal-close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}

function StaticGrid({ fields }: { fields: readonly Field[] }) {
  return (
    <div className="form-grid">
      {fields.map(([label, value]) => (
        <div className="form-field" key={label}>
          <label>{label}</label>
          <div className="static">{value}</div>
        </div>
      ))}
    </div>
  )
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="info-banner error">
      <AlertCircleIcon />
      {message}
    </div>
  )
}

/** View Transaction (RFHA hotspot). */
export function TxnModal({ modal, fields }: { modal: Modal; fields: readonly Field[] }) {
  return (
    <Overlay modal={modal}>
      <div className="modal modal-md">
        <ModalHead title="Transaction Details" onClose={modal.close} />
        <div className="modal-body">
          <StaticGrid fields={fields} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/**
 * The toggle hint's three states: the page's initial markup (with a bold "Change"), then
 * whatever the last toggle wrote as plain text. Opening the popup does not reset it.
 */
export type ChangeHint = 'initial' | 'editing' | 'idle'

/** Change / Invoice Plan Change-Confirm (Screen 9001). */
export function ChangeModal({
  modal,
  dealId,
  dealDesc,
  mcInput,
  editing,
  hint,
  error,
  onToggle,
  onOpenPicker,
  onConfirm,
}: {
  modal: Modal
  dealId: string
  dealDesc: string
  mcInput: string
  editing: boolean
  hint: ChangeHint
  error: string | null
  onToggle: () => void
  onOpenPicker: () => void
  onConfirm: () => void
}) {
  const wide: CSSProperties = { gridColumn: '1 / -1' }
  return (
    <Overlay modal={modal}>
      <div className="modal modal-md">
        <ModalHead title="Change / Confirm" onClose={modal.close} />
        <div className="modal-body">
          <div>
            <ErrorBanner message={error} />
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Deal ID</label>
              <div className="static">{dealId}</div>
            </div>
            <div className="form-field">
              <label>Deal Description</label>
              <div className="static">{dealDesc}</div>
            </div>
            <div className="form-field" style={wide}>
              <label>MC Reference No</label>
              <input
                type="text"
                placeholder="Select Master Contract..."
                disabled={!editing}
                readOnly
                value={mcInput}
                onClick={onOpenPicker}
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="left-note">
            {hint === 'initial' ? (
              <>
                Click <b>Change</b> to select a different Master Contract
              </>
            ) : hint === 'editing' ? (
              'Click the field to search for a Master Contract'
            ) : (
              'Click Change to select a different Master Contract'
            )}
          </span>
          <button type="button" className="btn" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onToggle}>
            {editing ? 'Cancel Change' : 'Change'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Master Contract picker (F4 help for MC Ref No). */
export function McPickerModal({
  modal,
  contracts,
  onPick,
}: {
  modal: Modal
  contracts: readonly MasterContract[]
  onPick: (mc: MasterContract) => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal modal-lg">
        <ModalHead title="Master Contract (1) - Search Result" onClose={modal.close} />
        <div className="modal-body">
          <div className="table-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>MC Ref No</th>
                  <th>MC Description</th>
                  <th>Origin Entity</th>
                  <th>MC Date</th>
                  <th className="num">MC Amount</th>
                  <th>Currency</th>
                  <th>Entity String</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((mc) => (
                  <tr key={mc.ref} style={{ cursor: 'pointer' }} onClick={() => onPick(mc)}>
                    <td className="hotspot">{mc.ref}</td>
                    <td>{mc.desc}</td>
                    <td>{mc.origin}</td>
                    <td>{mc.date}</td>
                    <td className="num">{fmtAmt(mc.amt)}</td>
                    <td>{mc.curr}</td>
                    <td>{mc.entstr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={modal.close}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Premium Adjustment (Screen 9003, read-only). */
export function PremiumModal({ modal, fields }: { modal: Modal; fields: readonly Field[] }) {
  return (
    <Overlay modal={modal}>
      <div className="modal modal-md">
        <ModalHead title="Premium Adjustment" onClose={modal.close} />
        <div className="modal-body">
          <StaticGrid fields={fields} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={modal.close}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Edit Deal Pair (Screen 9004). */
export function EditPairModal({
  modal,
  row,
  editing,
  newRfha,
  error,
  onNewRfhaChange,
  onToggle,
  onUpdate,
}: {
  modal: Modal
  row: TopRow | undefined
  editing: boolean
  newRfha: string
  error: string | null
  onNewRfhaChange: (v: string) => void
  onToggle: () => void
  onUpdate: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  // The page focused the field as soon as Edit enabled it.
  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  return (
    <Overlay modal={modal}>
      <div className="modal modal-md">
        <ModalHead title="Edit Deal Pair" onClose={modal.close} />
        <div className="modal-body">
          <div>
            <ErrorBanner message={error} />
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Deal Type</label>
              <div className="static">{row?.dealType}</div>
            </div>
            <div className="form-field">
              <label>Company Code</label>
              <div className="static">{row?.bukrs}</div>
            </div>
            <div className="form-field">
              <label>Old Transaction</label>
              <div className="static">{row?.rfha}</div>
            </div>
            <div className="form-field">
              <label>New Transaction</label>
              <input
                ref={input}
                type="text"
                placeholder="Enter new transaction no."
                disabled={!editing}
                value={newRfha}
                onChange={(e) => onNewRfhaChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="left-note">
            Click <b>Edit</b> to enter a replacement transaction number
          </span>
          <button type="button" className="btn" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onToggle}>
            {editing ? 'Cancel Edit' : 'Edit'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onUpdate}>
            Deal Update
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Cancel Deal ID (Screen 9005). */
export function CancelDealModal({
  modal,
  fields,
  onRequestCancel,
}: {
  modal: Modal
  fields: readonly Field[]
  onRequestCancel: () => void
}) {
  return (
    <Overlay modal={modal}>
      <div className="modal modal-md">
        <ModalHead title="Cancel Deal ID" onClose={modal.close} />
        <div className="modal-body">
          <StaticGrid fields={fields} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onRequestCancel}>
            Cancel Deal ID
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Generic confirm popup (POPUP_TO_CONFIRM), in the standard confirmation design. */
export function ConfirmModal({
  modal,
  title,
  message,
  onYes,
}: {
  modal: Modal
  title: string
  message: string
  onYes: () => void
}) {
  return (
    <ConfirmPopup
      open={modal.state === 'open'}
      tone="danger"
      title={title}
      message={message}
      cancelLabel="No"
      confirmLabel="Yes"
      onCancel={modal.close}
      onConfirm={() => {
        modal.close()
        onYes()
      }}
    />
  )
}
