import { TransactionDetailsBody, useTransactionDetails } from '../../shared/fx/TransactionDetails.tsx'
import { companyName } from './logic.ts'
import { ModalFrame, type FrameProps } from './modal.tsx'
import './txn-details.css'

export function TxnDetailsModal({ frame, rfha, bukrs }: { frame: FrameProps; rfha: string; bukrs: string }) {
  const state = useTransactionDetails(bukrs, rfha)
  return <ModalFrame frame={frame} title={`Transaction ${rfha}`} sub={bukrs} cls="txn-details-modal" actions={<>
    <button type="button" className="btn btn-secondary" disabled={state.loading} onClick={state.refresh}>Refresh details</button>
    <button type="button" className="btn btn-secondary" onClick={frame.onClose}>Close</button>
  </>}>
    <TransactionDetailsBody state={state} companyName={companyName(bukrs)} />
  </ModalFrame>
}
