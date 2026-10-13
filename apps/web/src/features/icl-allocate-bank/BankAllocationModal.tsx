export type BankAllocationModalProps = {
  open: boolean
  houseBankValue: string
  accountIdValue: string
  accountEnabled: boolean
  onClose: () => void
  onOpenHouseBank: () => void
  onOpenAccount: () => void
  onCreate: () => void
}

/** The "Drawdown From External Bank" modal — House Bank then Account ID lookups. */
export function BankAllocationModal({
  open,
  houseBankValue,
  accountIdValue,
  accountEnabled,
  onClose,
  onOpenHouseBank,
  onOpenAccount,
  onCreate,
}: BankAllocationModalProps) {
  return (
    <div className={open ? 'modal-bg open' : 'modal-bg'}>
      <div className="modal compact-bank">
        <div className="modal-head">
          <div className="modal-title">Drawdown From External Bank</div>
          <button className="modal-close" type="button" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body">
          <div className="compact-bank-form">
            <div className="modal-label">House Bank<span className="req">*</span></div>
            <div className="lookup-field" onClick={onOpenHouseBank}>
              <input className="lookup-input" type="text" readOnly placeholder="Select" value={houseBankValue} />
              <span className="lookup-cue" />
            </div>
            <div className="modal-label">Account ID<span className="req">*</span></div>
            <div
              className={accountEnabled ? 'lookup-field account' : 'lookup-field account disabled'}
              onClick={() => {
                if (accountEnabled) onOpenAccount()
              }}
            >
              <input className="lookup-input" type="text" readOnly placeholder="Select" value={accountIdValue} />
              <span className="lookup-cue" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={onCreate}>
            Create ICL
          </button>
        </div>
      </div>
    </div>
  )
}
