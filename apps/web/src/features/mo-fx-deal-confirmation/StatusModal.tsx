import { Backdrop, ModalHeader, type Modal } from './modal.tsx'
import type { StatusModalState } from './types.ts'

/** The page's success / info modal (showStatusModal); Refresh is its only caller today. */
export function StatusModal({ modal, status }: { modal: Modal; status: StatusModalState }) {
  const isError = status.type === 'error'
  return (
    <Backdrop id="statusBackdrop" modal={modal}>
      <div className="modal status-modal">
        <ModalHeader title={status.title} titleId="statusModalTitle" onClose={modal.close} />
        <div className="modal-body">
          <div className={`status-icon ${isError ? 'info' : 'success'}`} id="statusIcon">
            {isError ? '⚠' : '✓'}
          </div>
          <h3 id="statusHeading">{status.heading}</h3>
          <p id="statusMessage">{status.message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" type="button" onClick={modal.close}>
            OK
          </button>
        </div>
      </div>
    </Backdrop>
  )
}
