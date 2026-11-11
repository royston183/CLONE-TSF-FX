// One proposal in detail: how it changes the deal, each BL (numbered) with its reference, BL date, quantity and USD value,
// and the AI's reasoning. Untick BLs to propose again without them; Assign writes the Deal ID on the BLs.
import { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, RefreshCw, Sparkles } from 'lucide-react';
import { DataTable } from '@tsfx/components/table/DataTable';
import { downloadFile, sheetXlsx } from '@tsfx/lib/client/xlsx-write';
import { Modal } from '@tsfx/components/ui/Modal';
import { formatAmount4, formatCompact, formatDate } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { assignedTotal } from '@tsfx/lib/propose/match';
import { fmtQty } from '@tsfx/pages/manage-tradeflows/logic';
import type { DealRow } from './logic';
import type { Proposal } from './ProposeTradeflowsPage';
import { matchPct } from './view';
import { proposalFileName, proposalSheet } from './proposal-export';

const money = (v: number) => formatAmount4(v.toFixed(2));
const WAY_NAME: Record<string, string> = { fewest: 'Fewest BLs', closest: 'Closest amount', oldest: 'Oldest BLs', contracts: 'Fewest contracts', parties: 'Fewest notify parties' };

export function ProposalModal({ proposal, rank, deal, aimUsd, bls, busy, onClose, onAccept, onDrop }: {
  proposal: Proposal; rank: number; deal: DealRow; aimUsd: string; bls: Map<string, Row>; busy: boolean;
  onClose: () => void; onAccept: () => void; onDrop: (blNos: string[]) => void;
}) {
  const { combo, reason } = proposal;
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const rows = combo.bls.map(no => bls.get(no) ?? { blNo: no });
  const before = Number(deal.remainingUsd), total = Number(assignedTotal(combo, aimUsd)), after = before - total;
  const quantity = rows.reduce((s, b) => s + Math.round(Number(str(b.quantity) || 0) * 1000), 0) / 1000;
  const unit = str(rows[0]?.unit) || 'LBS';
  const ways = combo.kinds?.map(k => WAY_NAME[k]).filter(Boolean).join(' · ');
  const label = `${combo.fit === 'over' ? 'Covers the deal (outside 1%)' : combo.fit === 'under' ? 'Partial fill (outside 1%)' : rank === 1 ? 'Best match' : `Option ${rank}`}${ways ? ` · ${ways}` : ''}`;
  // The proposal as an Excel file: the deal and the proposal's figures on top, then its BLs (kept or not) and a total.
  const exportXlsx = () => {
    const at = new Date();
    const sheet = proposalSheet({ rank, way: ways ?? '', deal, totalUsd: total.toFixed(2), afterUsd: after.toFixed(2), match: matchPct(combo.diffPct), diffPct: combo.diffPct,
      bls: rows, dropped, unit, exportedAt: at, cap: combo.cap });
    downloadFile(proposalFileName(rank, deal.dealId, at), sheetXlsx(sheet, `Proposal ${rank}`, [24, 22, 16, 12, 13, 15, 16, 26, 18, 18, 7]));
  };
  const toggle = (no: string) => setDropped(d => { const n = new Set(d); if (n.has(no)) n.delete(no); else n.add(no); return n; });
  return (
    <Modal title={`Proposal ${rank} for ${deal.dealId}`} eyebrow={label}
      subtitle={`${combo.bls.length} BL${combo.bls.length > 1 ? 's' : ''} from ${combo.tfs} trade flow${combo.tfs > 1 ? 's' : ''} · ${fmtQty(quantity.toFixed(3))} ${unit} · ${deal.tsfCommodity}${deal.tsfCommodityText ? ` ${deal.tsfCommodityText}` : ''}`}
      size="wide" busy={busy} onClose={onClose}
      footer={<>
        <button className="button secondary" disabled={busy} onClick={exportXlsx} title="The deal, this proposal and its BLs as an Excel file"><FileSpreadsheet size={15} />Export to Excel</button>
        <button className="button secondary" disabled={busy} onClick={onClose}>Close</button>
        {dropped.size > 0 && <button className="button secondary" disabled={busy} onClick={() => onDrop([...dropped])}><RefreshCw size={14} />Re-propose without {dropped.size} BL{dropped.size > 1 ? 's' : ''}</button>}
        <button className="button" disabled={busy || dropped.size > 0} title={dropped.size ? 'Tick every BL to assign this proposal, or re-propose without the unticked ones' : undefined} onClick={onAccept}>
          <CheckCircle2 size={15} />{busy ? 'Assigning…' : `Assign ${combo.bls.length} BL${combo.bls.length > 1 ? 's' : ''} to ${deal.dealId}`}</button>
      </>}>
      <div className="tsf-proposal">
        <section className="tsf-proposal__section">
          <h4>Effect on the deal</h4>
          <dl className="tsf-proposal__figures">
            <div><dt>Remaining now</dt><dd>{money(before)} <small>USD</small><span className="num-short">{formatCompact(before)}</span></dd></div>
            <div className="plus"><dt>This proposal</dt><dd>{money(total)} <small>USD</small><span className="num-short">{formatCompact(total)}</span></dd></div>
            <div className={Math.abs(after) <= Math.abs(before) * 0.01 ? 'good' : ''}><dt>Remaining after</dt><dd>{money(after)} <small>USD</small><span className="num-short">{formatCompact(after)}</span></dd></div>
            <div><dt>Quantity</dt><dd>{fmtQty(quantity.toFixed(3))} <small>{unit}</small><span className="num-short">{formatCompact(quantity)}</span></dd></div>
            <div><dt>Match</dt><dd>{matchPct(combo.diffPct)} <small>{combo.diffPct > 0 ? '+' : ''}{combo.diffPct.toFixed(2)}%</small></dd></div>
          </dl>
        </section>
        {reason && !/Ranked by closeness/.test(reason) && (
          <section className="tsf-proposal__section tsf-proposal__why">
            <h4><Sparkles size={14} />Why this proposal</h4>
            <p>{reason}</p>
          </section>
        )}
        <section className="tsf-proposal__section">
          <h4>BLs in this proposal <small className="tsf-proposal__hint">Untick a BL to propose again without it.</small></h4>
          <div className="tsf-proposal__table">
          <DataTable nativeLayout nativeExport aria-label="BLs in the proposal">
            <thead><tr><th className="num">#</th><th>Keep</th><th>BL No</th><th>BL reference</th><th>BL date</th><th>Trade flow</th><th className="num">Quantity</th><th className="num">Value (USD)</th></tr></thead>
            <tbody>{rows.map((b, k) => {
              const no = str(b.blNo), off = dropped.has(no);
              return (
                <tr key={no} className={off ? 'tsf-proposal__off' : ''}>
                  <td className="num tsf-proposal__sno">{k + 1}</td>
                  <td><input type="checkbox" checked={!off} onChange={() => toggle(no)} aria-label={`Keep BL ${no}`} /></td>
                  <td className="mono">{no}</td>
                  <td className="mono">{str(b.blNumber) || '—'}</td>
                  <td>{str(b.blDate) ? formatDate(str(b.blDate)) : '—'}</td>
                  <td className="mono">{str(b.tfNo)}</td>
                  <td className="num">{fmtQty(str(b.quantity))}</td>
                  <td className="num">{combo.cap?.blNo === no
                    ? <>{formatAmount4(combo.cap.usd)} <small className="tsf-proposal__share">of {formatAmount4(str(b.usdValue))}</small></>
                    : formatAmount4(str(b.usdValue))}</td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><th colSpan={6}>Total · {rows.length} BLs</th><th className="num">{fmtQty(quantity.toFixed(3))} {unit}</th><th className="num">{formatAmount4(assignedTotal(combo, aimUsd))}</th></tr></tfoot>
          </DataTable>
          </div>
        </section>
        <p className="tsf-proposal__note">Assigning writes Deal ID {deal.dealId} on these BLs and stores each BL's USD value with it{combo.cap ? `; BL ${combo.cap.blNo} stores only the ${formatAmount4(combo.cap.usd)} USD the deal still needed` : ''}. Check it before assigning: an assignment is final.</p>
      </div>
    </Modal>
  );
}
