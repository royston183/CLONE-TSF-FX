import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'

/** The generic confirm dialog; it stacks on top of whatever popup asked for it. */
export function ConfirmModal({
  modals,
  title,
  body,
  onConfirm,
}: {
  modals: ModalStack
  title: string
  body: string
  onConfirm: () => void
}) {
  const close = () => modals.close('action')
  return (
    <Overlay id="action" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <ModalHeader title={title} subtitle="" onClose={close} />
        <div className="modal-body" id="action-body">
          <div className="hint">{body}</div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="action-confirm-btn"
            onClick={() => {
              close()
              onConfirm()
            }}
          >
            Yes, proceed
          </button>
        </div>
      </div>
    </Overlay>
  )
}
