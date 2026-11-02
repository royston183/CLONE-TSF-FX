import { MasterContractConfirmation } from '../../shared/master-contract/Confirmation.tsx'
import { ReviewDetails } from '../../shared/master-contract/ReviewDetails.tsx'
import { fmtAmount, fmtDate, fmtRate } from './format.ts'
import type { Modal } from './modal.tsx'
import type { Deal, DealSummary } from './types.ts'
import { EXTERNAL_REFERENCE_MAX_LENGTH, INTERNAL_REFERENCE_MAX_LENGTH } from './references.ts'

export type MatchReleaseValues = { externalRef: string; internalRef: string; remarks: string }

const referenceName = (code: string, name: string) => name.startsWith(code) ? name : [code, name].filter(Boolean).join(' · ')

/** Match & Release: the deal(s) being released, their Cover No, and the optional references. */
export function MatchReleaseModal({
  modal,
  summary,
  deals,
  values,
  onChange,
  onConfirm,
}: {
  modal: Modal
  summary: DealSummary
  deals: readonly Deal[]
  values: MatchReleaseValues
  onChange: (patch: Partial<MatchReleaseValues>) => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <MasterContractConfirmation open={modal.isOpen} review eyebrow="FX & Options Deal Confirmation"
      title={deals.length > 1 ? 'Confirm Deals' : 'Confirm Deal'}
      subtitle={<div className="std-pop-message">Review {deals.length > 1 ? `all ${deals.length} selected deals` : 'the transaction details'} before matching and releasing.</div>}
      confirmLabel={deals.length > 1 ? `Confirm ${deals.length} Deals` : 'Confirm Deal'}
      onCancel={modal.close} onConfirm={onConfirm}
      ids={{ overlay: 'matchReleaseBackdrop', title: 'mrTitle', body: 'mrBody', confirm: 'mrConfirmBtn', close: 'mrCloseBtn' }}>
          {summary.warning && (
            <div className="confirmation-review-warning" role="alert" id="mrLimitWarning">
              {summary.warning}
            </div>
          )}
          {deals.map((deal, index) => (
            <ReviewDetails key={deal.id} title={`${deal.currency1} / ${deal.currency2} · ${deal.dealType} · ${deal.transaction}`} open={index === 0} rows={[
              ['Transaction / Cover No', <span id={index === 0 ? 'mrCoverNo' : undefined}>{deal.transaction}</span>],
              ['Deal ID', <span id={index === 0 ? 'mrDealId' : undefined}>{deal.dealId || '—'}</span>],
              ['Company', referenceName(deal.coCode, deal.companyName)],
              ['Currency Pair', `${deal.currency1} / ${deal.currency2}`],
              ['Product Type', deal.productType],
              ['Transaction Type', deal.txnTypeDesc || deal.txnTypeCode],
              ['Bank / Counterparty', <span id={index === 0 ? 'mrPartner' : undefined}>{referenceName(deal.partnerCode, deal.partnerName)}</span>],
              ['Notional Amount 1', `${fmtAmount(Math.abs(deal.amount1))} ${deal.currency1}`],
              ['Notional Amount 2', `${fmtAmount(Math.abs(deal.amount2))} ${deal.currency2}`],
              ['Buy / Sell', `${deal.buySell1} ${deal.currency1} / ${deal.buySell2} ${deal.currency2}`],
              ['FX Deal Rate', fmtRate(deal.allInRate)],
              ['Trade Date', Number.isFinite(deal.tradeDate.getTime()) ? fmtDate(deal.tradeDate) : '—'],
              ['Maturity Date', Number.isFinite(deal.valueDate.getTime()) ? fmtDate(deal.valueDate) : '—'],
              ['Current Status', deal.status],
              ['FO Remarks', deal.foRemark],
            ]} />
          ))}
          <div className="confirmation-review-form">
          <div>
            <label htmlFor="mrExternalRef">External Ref</label>
            <input
              id="mrExternalRef"
              maxLength={EXTERNAL_REFERENCE_MAX_LENGTH}
              placeholder="Enter external reference"
              value={values.externalRef}
              onChange={(e) => onChange({ externalRef: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="mrInternalRef">Internal Ref</label>
            <input
              id="mrInternalRef"
              maxLength={INTERNAL_REFERENCE_MAX_LENGTH}
              placeholder="Enter internal reference"
              value={values.internalRef}
              onChange={(e) => onChange({ internalRef: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="mrRemarks">MO Remarks</label>
            <textarea
              id="mrRemarks"
              placeholder="Enter remarks"
              value={values.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </div>
          </div>
    </MasterContractConfirmation>
  )
}
