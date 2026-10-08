import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import type { ConfirmDialogState } from './types.ts'

/** Generic Yes/No confirm: the legacy #confirmModal, reused for Cancel/Amend Deal Status/Generate Invoice. */
export function ConfirmModal({ state, onClose }: { state: ConfirmDialogState; onClose: () => void }) {
  return (
    <ResultDialog
      tone="info"
      title={state.title}
      message={state.text}
      actions={[
        { label: 'No', kind: 'secondary', onClick: onClose },
        {
          label: state.yesLabel,
          kind: 'primary',
          onClick: () => {
            state.onYes()
          },
        },
      ]}
    >
      {state.note ? <div className="confirm-note">{state.note}</div> : null}
    </ResultDialog>
  )
}
