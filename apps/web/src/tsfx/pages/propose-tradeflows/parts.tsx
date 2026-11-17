// Propose Tradeflows: a Deal ID's assigned BLs grouped by trade flow (on the page and in the modal opened from the deal
// list), and the shape of a question to the AI.
import { ArrowRight, Banknote, Layers, ListChecks, Package, X } from 'lucide-react';
import { KpiRow } from '@tsfx/components/ui/McKpi';
import { DataTable } from '@tsfx/components/table/DataTable';
import { Modal } from '@tsfx/components/ui/Modal';
import { formatAmount4, formatDate } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { fmtQty } from '@tsfx/pages/manage-tradeflows/logic';
import { assignedByTradeflow } from './logic';

/** One question to the AI about the proposals shown, and its answer. */
export interface Turn { question: string; answer: string; ai: boolean }

/** A Deal ID's assigned BLs, one block per trade flow. */
export function AssignedGroups({ dealId, bls }: { dealId: string; bls: Row[] }) {
  const { groups, usd, count } = assignedByTradeflow(dealId, bls);
  const quantity = (groups.reduce((s, g) => s + Math.round(Number(g.quantity) * 1000), 0) / 1000).toFixed(3);
  const unit = str(groups[0]?.bls[0]?.unit) || 'LBS';
  if (!count) return <p className="tsf-propose__muted">None yet. Choose a proposal and assign it to put its BLs on {dealId}.</p>;
  return (
    <div className="tsf-propose__groups">
      <KpiRow compact label="Assigned BLs summary" items={[
        { value: count, label: 'Assigned BLs', note: `on ${dealId}`, icon: <ListChecks size={16} /> },
        { value: groups.length, label: 'Trade flows', note: 'BLs come from', tone: 'violet', icon: <Layers size={16} /> },
        { value: fmtQty(quantity), unit: unit, label: 'Total quantity', tone: 'amber', icon: <Package size={16} /> },
        { value: formatAmount4(usd), unit: 'USD', label: 'Total assigned', tone: 'green', icon: <Banknote size={16} /> }
      ]} />
      <div className="tsf-propose__scroll">
      <DataTable nativeLayout nativeExport stretch aria-label={`BLs assigned to ${dealId}`}>
        <thead><tr><th>Trade flow</th><th>BL No</th><th>BL date</th><th className="num">Quantity</th><th className="num">Assigned USD</th></tr></thead>
        <tbody>{groups.flatMap(g => g.bls.map(b => (
          <tr key={str(b.blNo)}>
            <td className="mono">{g.tfNo}</td>
            <td className="mono">{str(b.blNo)}</td>
            <td>{formatDate(str(b.blDate) || g.tfDate)}</td>
            <td className="num">{fmtQty(str(b.quantity))}</td>
            <td className="num">{formatAmount4(str(b.assignedUsd))}{Number(str(b.usdValue)) > Number(str(b.assignedUsd)) + 0.005 && <small className="tsf-propose__capped"> of {formatAmount4(str(b.usdValue))}</small>}</td>
          </tr>
        )))}</tbody>
        <tfoot><tr><th colSpan={3}>Total · {count} BL{count === 1 ? '' : 's'}</th><th className="num">{fmtQty(quantity)} {unit}</th><th className="num">{formatAmount4(usd)}</th></tr></tfoot>
      </DataTable>
      </div>
    </div>
  );
}

/** The modal opened from a deal in the list: its assigned BLs by trade flow. */
export function AssignedModal({ deal, bls, onClose, onOpenDeal }: { deal: { dealId: string; dealDesc: string; tsfCommodity: string; tsfCommodityText: string }; bls: Row[]; onClose: () => void; onOpenDeal: () => void }) {
  return (
    <Modal title={`BLs assigned to ${deal.dealId}`} eyebrow="Deal ID" size="wide" onClose={onClose}
      subtitle={`${deal.dealDesc || '—'} · ${deal.tsfCommodity}${deal.tsfCommodityText ? ` ${deal.tsfCommodityText}` : ''}`}
      footer={<>
        <button className="button secondary" onClick={onClose}><X size={14} />Close</button>
        <button className="button" onClick={onOpenDeal}>Open the deal <ArrowRight size={15} /></button>
      </>}>
      <div className="tsf-propose"><AssignedGroups dealId={deal.dealId} bls={bls} /></div>
    </Modal>
  );
}
