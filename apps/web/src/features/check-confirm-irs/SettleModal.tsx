import { ConfirmDetails } from '../../shared/ui/ConfirmDetails.tsx'

export type SettleModalProps = {
  details?: ReadonlyArray<{ label: string; value: string }>
  open: boolean
  transaction: string
  onNo(): void
  onYes(): void
}

export function SettleModal({ open, transaction, details = [], onNo, onYes }: SettleModalProps) {
  return (
    <div className={open ? 'modal-bg open' : 'modal-bg'}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Confirm Settlement</div>
          <button className="modal-close" type="button" onClick={onNo}>
            X
          </button>
        </div>
        <div className="modal-body">
          <div className="confirm-copy">
            Are you sure you want to settle IRS Transaction <b>{transaction}</b>?
          </div>
          <ConfirmDetails rows={details} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onNo}>
            No
          </button>
          <button className="btn btn-primary" type="button" onClick={onYes}>
            Yes
          </button>
        </div>
      </div>
    </div>
  )
}
