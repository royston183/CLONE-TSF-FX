import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'

/**
 * The operating notes, plus a note on the selected row when exactly one is checked
 * (`target` is then its reference).
 */
export function NotesModal({
  modals,
  target,
  text,
  onText,
  onSave,
}: {
  modals: ModalStack
  target: string | null
  text: string
  onText: (text: string) => void
  onSave: () => void
}) {
  const close = () => modals.close('notes')
  return (
    <Overlay id="notes" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 'min(640px, calc(100vw - 40px))' }}>
        <ModalHeader
          title="Notes"
          subtitle={target ? `${target} - operational notes + selected row note` : 'FX Blotter operating notes'}
          onClose={close}
        />
        <div className="modal-body">
          <ol className="notes-list">
            <li>
              Use the date format <strong>DD-MM-YYYY</strong> throughout this standalone blotter.
            </li>
            <li>
              <strong>Deal Creation:</strong> after entering data, select one or more rows and choose Create
              Transaction. A transaction number is assigned and the row becomes read-only.
            </li>
            <li>
              <strong>Errors &amp; Deletion:</strong> draft/error rows can be deleted and re-entered. Created
              transactions can be reversed through the existing reversal flow.
            </li>
            <li>
              <strong>Release to MO:</strong> after creation, select one or two Created transactions and release them to
              Mid-Office. Released rows remain read-only.
            </li>
            <li>
              For NDF / DNDF transactions, settlement handling follows the USD-oriented logic represented in the
              supplied program.
            </li>
          </ol>
          <div className="notes-row-box" id="notes-row-box" style={{ display: target ? 'block' : 'none' }}>
            <div className="form-field span3">
              <label htmlFor="notes-text">Selected Row Note (optional)</label>
              <textarea
                id="notes-text"
                rows={4}
                placeholder="Add a note to the selected blotter row..."
                value={text}
                onChange={(e) => onText(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Close
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="notes-save-btn"
            style={{ display: target ? 'inline-flex' : 'none' }}
            onClick={onSave}
          >
            Save Row Note
          </button>
        </div>
      </div>
    </Overlay>
  )
}
