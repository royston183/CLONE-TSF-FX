import { postHint } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Deal } from './types.ts'

/** The generic confirmation dialog, used for TBB1 Post. */
export function PostDialog({ modal, deal, onConfirm }: { modal: Modal; deal: Deal | null; onConfirm: () => void }) {
  return (
    <Overlay id="action-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title" id="action-title">
              Post Settlement
            </div>
            <div className="modal-subtitle" id="action-subtitle">
              {deal ? `${deal.dealId} · Txn ${deal.rfha}` : ' '}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body" id="action-body">
          {deal ? <p className="hint">{postHint(deal)}</p> : null}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn-confirm" type="button" id="action-confirm-btn" onClick={onConfirm}>
            Post
          </button>
        </div>
      </div>
    </Overlay>
  )
}
