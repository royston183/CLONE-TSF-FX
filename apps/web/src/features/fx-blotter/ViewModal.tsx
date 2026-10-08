import { DetailGrid, ModalHeader, Overlay, type ModalStack } from './modal.tsx'

export type ViewContent = { subtitle: string; pairs: Array<[string, string]>; kind: 'row' | 'mc' }

/** Transaction Display for a row, or the Master Contract behind an MC Ref link. */
export function ViewModal({ modals, content }: { modals: ModalStack; content: ViewContent }) {
  const close = () => modals.close('view')
  return (
    <Overlay id="view" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 'min(640px, calc(100vw - 40px))' }}>
        <ModalHeader title="Transaction Display" subtitle={content.subtitle} onClose={close} />
        <div className="modal-body">
          <DetailGrid pairs={content.pairs} />
          <div className="hint" id="view-hint">
            {content.kind === 'row' ? (
              <>
                <strong>Standalone simulation of SAP transaction display.</strong> In SAP, <code>ZSGSLCFM_DISPLAY</code>{' '}
                receives Company Code + RFHA in display mode, reads the transaction/activity data, and routes to{' '}
                <code>TB_TRANSACTION_TO_DISPLAY</code>. This browser-only version shows the corresponding blotter
                transaction read-only and does not call an SAP transaction.
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
