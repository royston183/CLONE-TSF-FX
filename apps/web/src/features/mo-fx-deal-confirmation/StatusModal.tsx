import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import type { Modal } from './modal.tsx'
import type { StatusModalState } from './types.ts'

/** The page's success / info modal (showStatusModal); Refresh is its only caller today. */
export function StatusModal({ modal, status }: { modal: Modal; status: StatusModalState }) {
  if (!modal.isOpen) return null
  return (
    <ResultDialog
      tone={status.type === 'error' ? 'warning' : 'success'}
      title={status.heading}
      message={status.message}
      actions={[{ label: 'OK', kind: 'primary', onClick: modal.close }]}
    />
  )
}
