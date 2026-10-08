import { StatusPopup } from '../../shared/popup/Popup.tsx'
import type { Modal } from './modal.tsx'
export function SuccessModal({ modal, mcNumber, onDone, onSendToMO }: {
 modal: Modal; mcNumber: number | null; onDone: () => void; onSendToMO: () => void
}) {
 return <StatusPopup open={modal.state === 'open'} tone="success" title="Master Contract Created"
 message="The Master Contract has been created successfully." refLabel="Deal ID / MC Number"
 refValue={mcNumber} onClose={onDone} actions={[
 { label: 'Close', onClick: onDone, autoFocus: true },
 { label: 'Send to M.O.', onClick: onSendToMO, variant: 'danger' }]} />
}
