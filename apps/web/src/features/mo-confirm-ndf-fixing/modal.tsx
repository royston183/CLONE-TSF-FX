import type { ReactNode } from 'react'
import { formatAmount } from './format.ts'
import type { NdfDeal } from './types.ts'

/**
 * The original's .modal-overlay. It was shown by dropping its "hidden" class, which also
 * replays the stylesheet's fade-in and card entrance each time; a click on the backdrop itself
 * (not the card) closes it.
 */
export function Overlay({ id, open, onClose, children }: { id: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className={`modal-overlay${open ? '' : ' hidden'}`}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

/** The .deal-summary grid at the top of the Match & Release and Correction Required dialogs. */
export function DealSummary({ id, deal }: { id: string; deal: NdfDeal | null }) {
  return (
    <div className="deal-summary" id={id}>
      {deal ? (
        <>
          <SummaryItem label="Deal ID" value={deal.dealId} />
          <SummaryItem label="Transaction" value={deal.transaction} />
          <SummaryItem label="Partner" value={deal.partnerName} />
          <SummaryItem label="Currency Pair" value={`${deal.currency1} / ${deal.currency2}`} />
          <SummaryItem label="Fixing Date" value={deal.fixingDate} />
          <SummaryItem label="NDF Value" value={formatAmount(deal.ndfValue)} />
        </>
      ) : null}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-item">
      <div className="ds-label">{label}</div>
      <div className="ds-value">{value}</div>
    </div>
  )
}
