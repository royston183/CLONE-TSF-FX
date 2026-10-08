import { ResultDialog } from '../../shared/ui/ResultDialog.tsx'
import { postHint } from './logic.ts'
import type { Modal } from './modal.tsx'
import type { Deal } from './types.ts'

/** The generic confirmation dialog, used for TBB1 Post. */
export function PostDialog({ modal, deal, onConfirm }: { modal: Modal; deal: Deal | null; onConfirm: () => void }) {
  if (!modal.isOpen) return null
  return (
    <ResultDialog
      tone="info"
      title="Post Settlement"
      message={deal ? postHint(deal) : undefined}
      reference={deal ? { label: 'Deal ID / Txn No', value: `${deal.dealId} · Txn ${deal.rfha}` } : undefined}
      actions={[
        { label: 'Cancel', kind: 'secondary', onClick: modal.close },
        { label: 'Post', kind: 'primary', onClick: onConfirm },
      ]}
    />
  )
}
