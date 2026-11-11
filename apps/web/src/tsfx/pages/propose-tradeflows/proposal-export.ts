// A proposal as an Excel sheet (pure, tested): the deal and the proposal's figures on top, then every BL of the proposal
// (with whether it is kept), and a total row. Amounts and quantities are number cells Excel can sum; codes stay text.
import { formatDate } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { XlsxCell } from '@tsfx/lib/client/xlsx-write';

export interface ProposalSheetInput {
  rank: number; way: string;
  deal: { dealId: string; dealDesc: string; tsfCommodity: string; tsfCommodityText: string; amount: string; currency: string; usd: string | null; assignedUsd: string; remainingUsd: string };
  /** What the proposal assigns (USD), what remains after it, the match (e.g. "99.1%") and the difference in %. */
  totalUsd: string; afterUsd: string; match: string; diffPct: number;
  bls: Row[]; dropped: Set<string>; unit: string; exportedAt: Date;
  /** A BL that gives only part of its value (the rest of the deal): its value in the sheet is that part. */
  cap?: { blNo: string; usd: string };
}

const num = (v: string | number): XlsxCell => ({ number: typeof v === 'number' ? String(v) : str(v) || '0' });
const day = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
const date = (v: unknown) => (str(v) ? formatDate(str(v)) : '');

export function proposalSheet(x: ProposalSheetInput): XlsxCell[][] {
  const { deal } = x;
  const quantity = x.bls.reduce((s, b) => s + Math.round(Number(str(b.quantity) || 0) * 1000), 0) / 1000;
  const rows: XlsxCell[][] = [
    [`Proposal ${x.rank} for Deal ID ${deal.dealId}`],
    [],
    ['Deal ID', deal.dealId],
    ['Description', deal.dealDesc],
    ['Commodity', [deal.tsfCommodity, deal.tsfCommodityText].filter(Boolean).join(' ')],
    ['Deal amount', num(deal.amount), deal.currency],
    ['Deal amount (USD)', deal.usd === null ? 'no USD rate' : num(deal.usd)],
    ['Assigned before (USD)', num(deal.assignedUsd)],
    ['Unassigned now (USD)', num(deal.remainingUsd)],
    [],
    ['Proposal', `${x.rank}${x.way ? ` · ${x.way}` : ''}`],
    ['This proposal (USD)', num(x.totalUsd)],
    ['Unassigned after (USD)', num(x.afterUsd)],
    ['Match', `${x.match} (${x.diffPct > 0 ? '+' : ''}${x.diffPct.toFixed(2)}%)`],
    ['BLs', String(x.bls.length), 'Kept', String(x.bls.length - x.dropped.size)],
    [`Quantity (${x.unit})`, num(quantity.toFixed(3))],
    ['Exported', day(x.exportedAt)],
    [],
    ['#', 'BL No', 'BL reference', 'BL date', 'Trade flow', 'Trade flow date', 'Contract', 'Notify party', `Quantity (${x.unit})`, 'Value (USD)', 'Keep']
  ];
  x.bls.forEach((b, i) => rows.push([
    String(i + 1), str(b.blNo), str(b.blNumber), date(b.blDate), str(b.tfNo), date(b.tfDate), str(b.contractRef), str(b.notifyParty),
    num(str(b.quantity)), num(x.cap?.blNo === str(b.blNo) ? x.cap.usd : str(b.usdValue)), x.dropped.has(str(b.blNo)) ? 'No' : 'Yes'
  ]));
  rows.push(['Total', `${x.bls.length} BLs`, '', '', '', '', '', '', num(quantity.toFixed(3)), num(x.totalUsd), '']);
  return rows;
}

/** Proposal-3-7000000080-20261108.xlsx */
export const proposalFileName = (rank: number, dealId: string, at: Date) =>
  `Proposal-${rank}-${dealId}-${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}.xlsx`;
