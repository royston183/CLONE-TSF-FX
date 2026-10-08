import { MANUAL_CONFIRM_HEADING } from './logic.ts'
import type { Modal } from './modal.tsx'
import type { ExpiryConfirm } from './types.ts'
import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
export function ConfirmExpiryModal({ modal, confirm, onCancel, onExpire }: {
 modal: Modal; confirm: ExpiryConfirm | null; onCancel: () => void; onExpire: () => void | Promise<void>
}) {
 return <MasterContractConfirmation open={modal.state === 'open'} danger title="Confirm Expiry Update"
   message={<><strong>{confirm?.heading ?? MANUAL_CONFIRM_HEADING}</strong><p>{confirm?.subtext ?? 'This will update the status of the selected Master Contract(s) to Expired. This action cannot be undone in this session.'}</p></>}
   confirmLabel="Expire" onCancel={onCancel} onConfirm={onExpire} />
}
