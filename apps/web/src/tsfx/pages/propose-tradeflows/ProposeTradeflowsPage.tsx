// Propose Tradeflows: Deal IDs with what is left of them in USD, and for the chosen one, proposals of free BLs of its
// commodity that add up to that amount (±1%). The app finds the combinations (deterministic, on real SAP rows); typed
// conditions filter what it may use (read by the app, or by the AI for what the app cannot read); the AI ranks and
// explains. A proposal opens in a modal, where it is accepted after the BLs are checked again against SAP.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, HelpCircle, ListChecks, Search, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react';
import { DataTable } from '@tsfx/components/table/DataTable';
import { TrafficLightTag } from '@tsfx/components/ui/Badge';
import { Notice } from '@tsfx/components/ui/Notice';
import { Toast, useToast } from '@tsfx/components/ui/Toast';
import { onSampleData } from '@tsfx/lib/client/data';
import { formatAmount4, formatCompact, formatDate } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { assignedTotal, candidates, type Combination } from '@tsfx/lib/propose/match';
import { dealMismatch, mergeCriteria, readConditions, resolveTop, targetOf, type Criteria } from '@tsfx/lib/propose/query';
import { sampleProposeData, type Interpretation, type ProposeData } from './data';
import { liveProposeData } from './live';
import { acceptPlan, assignedByTradeflow, commodityNote, dealFigures, dealRows, dealTotals, pctText, usdMn, DEFAULT_ANSWERS, waysOf, distinctProposals, proposalsUnder, rulesOf, type DealRow, type Fill, type FillAnswers } from './logic';
import { AssignedGroups, AssignedModal } from './parts';
import { assignStatusProblem } from './status-rules';
import { BeanLoader } from './BeanLoader';
import { ProposalModal } from './ProposalModal';
import { assignState, orderByRules, progressPct, STATE_TONE } from './view';
import './propose.css';

interface Loaded { deals: DealRow[]; bls: Row[]; commodities: Row[] }
export interface Proposal { combo: Combination; reason: string }
/** One condition as typed and applied; the conditions stack, and each can be removed on its own. */
export interface Entry { id: number; text: string; reading: Interpretation }
const usd = (v: string | null) => (v === null || v === '' ? '—' : `${formatAmount4(v)} USD`);
/** The most BL detail rows one AI request carries (the BackEnd accepts 1,000). */
const AI_BL_ROWS = 1000;
const StateTag = ({ deal }: { deal: DealRow }) => { const s = assignState(deal); return <TrafficLightTag tone={STATE_TONE[s]}>{s}</TrafficLightTag>; };
const FIT_LABEL = { over: 'Covers the deal', under: 'Partial fill' } as const;
const FILLS: [Fill, string][] = [['fewest', 'Fewest BLs'], ['closest', 'Closest amount'], ['oldest', 'Oldest trade flows']];
/** What each way of filling means for the person choosing (shown under the proposal). */
const WAY: Record<string, { name: string; note: string }> = {
  fewest: { name: 'Fewest BLs', note: 'Biggest BLs first: the fewest BLs to handle, but it uses up the large ones.' },
  closest: { name: 'Closest amount', note: 'Nearest to the amount left: the least left over or short.' },
  oldest: { name: 'Oldest BLs', note: 'Oldest BL dates first: clears the aged BLs before newer ones.' },
  contracts: { name: 'Fewest contracts', note: 'Keeps to as few contracts as it can: simpler documents.' },
  parties: { name: 'Fewest notify parties', note: 'Keeps to as few notify parties as it can: fewer counterparties.' }
};
const SHOWN = 6;
/** What is left of the deals shown, open ones only (a filled deal can be a little over or under). */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** What can be typed in the bar, by kind (the guide under "What can I type?"). */
const GUIDE: [string, string[]][] = [
  ['Largest, smallest, oldest', ['top 10 largest BLs', 'exclude the 20 smallest BLs', 'only the 400 oldest BLs', 'top 5 BLs by quantity']],
  ['Leave BLs out or keep them in', ['exclude BL 4000001234', 'exclude BLs 4000001000 to 4000001100', 'only BLs 4000001000 to 4000001600', 'must include BL 4000001234', 'exclude trade flow 3000001234']],
  ['Dates', ['BL date in October', 'BLs dated after 15 Oct 2026', 'shipped before 01 Nov 2026', 'ETA between 01 Nov 2026 and 30 Nov 2026']],
  ['Value and quantity', ['BLs above 50K', 'BL value min 40K', 'BL value max 80K', 'BLs between 20K and 60K', 'quantity above 60000 LBS']],
  ['Contract, notify party, invoice', ['only contract VAR-CTR-ARA', 'exclude notify party Olam', 'exclude invoice VAR-INV-12', 'BL reference VAR-ARA-00*']],
  ['How many BLs, which first', ['at least 300 BLs', 'max 450 BLs', 'min 320 BLs', 'oldest first', 'fewest trade flows']],
  ['Part of the deal', ['fill 50%', 'propose 1 Cr only']],
  ['Across deals', ['show deals above 1 Cr', 'deals with left above 50L']]
];
/** A long list of BLs in a chip: the first few, then how many in all. */
const short = (label: string) => (label.length > 90 ? `${label.slice(0, 80).replace(/,\s*\d*$/, '')}, … (${label.split(',').length} in all)` : label);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function ProposeTradeflowsPage() {
  // Live data once its modules have a source (SAP, the middleware, the AI); the sample data otherwise.
  const data = useMemo(() => (onSampleData('bl-assign') ? sampleProposeData() : liveProposeData()), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelectedDeal] = useState('');
  const setSelected = (id: string) => {
    // (The same list when nothing is cleared: a new one would make the proposals be worked out again for nothing.)
    if (id !== selected) setEntries(list => { const kept = list.filter(e => e.reading.criteria.scope === 'all'); return kept.length === list.length ? list : kept; });
    setSelectedDeal(id);
  };
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'open' | 'assigned' | 'all'>('open');
  const [answers, setAnswers] = useState<FillAnswers>(DEFAULT_ANSWERS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewing, setViewing] = useState<DealRow | null>(null);
  const [toast, notify] = useToast();
  // What has arrived while the page loads (the loader ticks each one off).
  const [ready, setReady] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const tick = <T,>(key: string, p: Promise<T>, note: (x: T) => string) => p.then(x => { if (live) setReady(r => ({ ...r, [key]: note(x) })); return x; });
    Promise.all([
      tick('deals', data.deals(), d => `${d.length} deals`),
      tick('bls', data.bls(), b => `${b.length.toLocaleString('en-US')} BLs`),
      tick('commodities', data.commodities(), c => `${c.length} commodities`),
      tick('rates', data.rates(), r => `${Object.keys(r).length} currencies`)
    ]).then(([deals, bls, commodities, rates]) => {
      if (!live) return;
      setLoaded({ deals: dealRows(deals, bls, rates), bls, commodities });
      // Deal IDs whose BLs were assigned while their status stayed behind (01–03) are moved to 04 now.
      data.syncStatuses?.(bls).then(ids => { if (live && ids.length) notify(`Deal ID status set to 04 for ${ids.join(', ')}: invoices can be generated.`, 'success'); }, (e: Error) => { if (live) notify(e.message, 'error'); });
    }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reload, notify]);

  const criteria = useMemo(() => mergeCriteria(entries.map(e => e.reading.criteria)), [entries]);
  const acrossDeals = criteria.scope === 'all';
  const q = search.trim().toLowerCase();
  const assignedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of loaded?.bls ?? []) if (str(b.dealId) && str(b.deletedFlag) !== 'X') m.set(str(b.dealId), (m.get(str(b.dealId)) ?? 0) + 1);
    return m;
  }, [loaded]);
  // "With BLs" lists only the deals that have BLs; "Open" keeps the chosen deal while it fills.
  const shown = (loaded?.deals ?? []).filter(d => (view === 'all'
      || (view === 'open' ? d.status === 'Open' || d.dealId === selected : (assignedCount.get(d.dealId) ?? 0) > 0))
    && (!q || `${d.dealId} ${d.dealDesc} ${d.tsfCommodity} ${d.tsfCommodityText}`.toLowerCase().includes(q))
    // A search across deals keeps only the deals the conditions accept.
    && (!acrossDeals || !dealMismatch(d, criteria, loaded?.commodities ?? [])));
  // The list marks the deal at once; its panel (proposals for 300-500 BLs) follows in the background.
  const opened = useDeferredValue(selected);
  const deal = loaded?.deals.find(d => d.dealId === opened) ?? null;
  /** The deal before / after the chosen one in the list as filtered (the list itself is hidden while a deal is open). */
  const neighbour = (step: number) => { const i = shown.findIndex(d => d.dealId === selected); return i < 0 ? '' : shown[i + step]?.dealId ?? ''; };

  return (
    <section className="tsf-propose">
      {data.sample && <Notice>Running on sample data: Deal IDs, BLs and rates are examples, and the AI is not connected.</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {!loaded && !error && <BeanLoader steps={['deals', 'bls', 'commodities', 'rates'].map(k => ({ done: k in ready }))} />}
      {loaded && (
        <div className={`tsf-propose__layout${selected ? ' tsf-propose__layout--deal' : ''}`}>
          {!selected && <aside className="panel tsf-propose__deals" aria-label="Deal IDs">
            <div className="tsf-propose__deals-head">
              <h2>Deal IDs <span>{shown.length}</span></h2>
              <label className="tsf-propose__search"><Search size={13} />
                <input className="input" placeholder="Search Deal ID, description, commodity" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search Deal IDs" />
              </label>
              <div className="tsf-propose__filter tsf-tabs" role="group" aria-label="Show deals">
                {([['open', 'To assign'], ['assigned', 'With BLs'], ['all', 'All']] as const).map(([id, label]) => (
                  <button key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}<span className="count" aria-hidden="true">{
                    (loaded.deals).filter(d => id === 'all' || (id === 'open' ? d.status === 'Open' : (assignedCount.get(d.dealId) ?? 0) > 0)).length}</span></button>
                ))}
              </div>
              {acrossDeals && <p className="tsf-propose__scoped"><SlidersHorizontal size={12} />Filtered by the conditions<button className="tsf-propose__link" aria-label="Clear the conditions filtering the deals" onClick={() => setEntries([])}>Clear</button></p>}
            </div>
            {shown.length > 0 ? (
              <div className="tsf-propose__dealscroll">
              <DataTable nativeLayout nativeExport aria-label="Deal IDs" className="tsf-propose__dealtable">
                <thead><tr><th>Deal ID</th><th>Commodity</th><th className="num">Total (USD Mn)</th><th className="num">Utilized (USD Mn)</th><th className="num">Balance (USD Mn)</th><th className="num">Remaining %</th><th>Status</th></tr></thead>
                <tbody>{shown.map(d => {
                  const n = assignedCount.get(d.dealId) ?? 0;
                  const f = dealFigures(d);
                  const full = (v: string | null) => (v === null ? 'Not available' : `${formatAmount4(v)} USD`);
                  return (
                    <tr key={d.dealId} data-table-row="" className={d.dealId === selected ? 'selected' : ''} onClick={() => setSelected(d.dealId)}>
                      <td><button className="tsf-propose__dealid mono" onClick={e => { e.stopPropagation(); setSelected(d.dealId); }} aria-pressed={d.dealId === selected} aria-label={`Deal ${d.dealId} ${assignState(d)}`}>{d.dealId}</button>
                        {n > 0 && <button className="tsf-propose__bls-link" onClick={e => { e.stopPropagation(); setViewing(d); }} aria-label={`View the BLs assigned to ${d.dealId}`} title={`${n} BLs assigned · ${formatAmount4(d.assignedUsd)} USD`}><ListChecks size={11} />{n}</button>}</td>
                      <td>{d.tsfCommodity ? `${d.tsfCommodity}${d.tsfCommodityText ? ` · ${d.tsfCommodityText}` : ''}` : '—'}</td>
                      <td className="num" title={full(f.total)}>{usdMn(f.total)}</td>
                      <td className="num" title={full(f.utilized)}>{usdMn(f.utilized)}</td>
                      <td className={`num${f.balance !== null && Number(f.balance) < 0 ? ' tsf-propose__neg' : ''}`} title={f.issue ? `${f.issue} (${full(f.balance)})` : full(f.balance)}>{usdMn(f.balance)}{f.issue && <AlertCircle size={11} className="tsf-propose__flag" aria-label={f.issue} />}</td>
                      <td className="num" title={f.remainingPct === null ? f.issue : undefined}>{pctText(f.remainingPct)}</td>
                      <td><StateTag deal={d} /></td>
                    </tr>
                  );
                })}</tbody>
                <tfoot>{(() => { const t = dealTotals(shown); return <tr><th>Total</th><th>{shown.length} deal{shown.length === 1 ? '' : 's'}</th><th className="num" title={`${formatAmount4(t.total ?? '0')} USD`}>{usdMn(t.total)}</th><th className="num" title={`${formatAmount4(t.utilized)} USD`}>{usdMn(t.utilized)}</th><th className="num" title={t.issue || `${formatAmount4(t.balance ?? '0')} USD`}>{usdMn(t.balance)}</th><th className="num">{pctText(t.remainingPct)}</th><th /></tr>; })()}</tfoot>
              </DataTable>
              </div>
            ) : <p className="tsf-propose__muted tsf-propose__pad">{acrossDeals ? 'No matching deals or available BLs found for the selected criteria.' : view === 'assigned' ? 'No deal has BLs assigned yet. Assign a proposal and its deal shows here.' : 'No Deal IDs match.'}</p>}
          </aside>}
          <div className="tsf-propose__main">
            {selected !== opened && <p className="tsf-propose__updating" role="status"><span aria-hidden="true" />Opening {selected}…</p>}
            {!deal && !selected && (
              <div className="panel tsf-propose__empty">
                <Wand2 size={24} />
                <h3>Choose a Deal ID</h3>
                <p>Its proposals appear here: free BLs of the same commodity whose USD value comes within 1% of what is left of the deal.</p>
              </div>
            )}
            {deal && selected && <DealPanel key={deal.dealId} deal={deal} loaded={loaded} data={data} answers={answers} onAnswers={setAnswers}
              nav={{ back: () => setSelected(''), prev: neighbour(-1), next: neighbour(1), go: setSelected, at: Math.max(0, shown.findIndex(d => d.dealId === deal.dealId)) + 1, of: shown.length }}
              entries={entries} onEntries={setEntries} criteria={criteria}
              firstTab={view === 'assigned' || deal.status !== 'Open' ? 'assigned' : 'proposals'}
              onChanged={text => { notify(text, 'success'); setReload(r => r + 1); }} onError={text => notify(text, 'error')} />}
          </div>
        </div>
      )}
      {viewing && loaded && <AssignedModal deal={viewing} bls={loaded.bls} onClose={() => setViewing(null)} onOpenDeal={() => { setSelected(viewing.dealId); setViewing(null); }} />}
      <Toast toast={toast} />
    </section>
  );
}

interface DealNav { back: () => void; prev: string; next: string; go: (id: string) => void; at: number; of: number }

function DealPanel({ deal, nav, loaded, data, answers, onAnswers, entries, onEntries, criteria, firstTab, onChanged, onError }: {
  deal: DealRow; nav: DealNav; loaded: Loaded; data: ProposeData; answers: FillAnswers; onAnswers: (a: FillAnswers) => void;
  entries: Entry[]; onEntries: (e: Entry[] | ((list: Entry[]) => Entry[])) => void; criteria: Criteria; firstTab: 'proposals' | 'assigned';
  onChanged: (t: string) => void; onError: (t: string) => void;
}) {
  const [typed, setTyped] = useState('');
  // The assistant's answer to the last request: what it understood and did, or what it could not place.
  const [reply, setReply] = useState<{ applied: string[]; notUnderstood: string[] } | null>(null);
  const [tab, setTab] = useState<'proposals' | 'assigned'>(firstTab);
  const input = useRef<HTMLInputElement>(null);
  const [reading_, setReadingBusy] = useState(false);
  const [ranked, setRanked] = useState<{ key: string; list: Proposal[]; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Proposal | null>(null);
  // What the proposals aim at: what is left, or the part the conditions ask for ("fill 50%").
  const aimUsd = targetOf(deal.remainingUsd, criteria);
  const assignedCountHere = assignedByTradeflow(deal.dealId, loaded.bls).count;
  const byNo = useMemo(() => new Map(loaded.bls.map(b => [str(b.blNo), b])), [loaded.bls]);
  const note = commodityNote(deal, loaded.commodities);

  // The proposals: calculated here, on the BLs read from SAP, under the conditions and the options chosen.
  // The chips and chips of conditions change at once; the proposals follow in the background (the search can take a
  // moment on 300-500 BL deals), with "Updating proposals…" meanwhile.
  const lateAnswers = useDeferredValue(answers);
  const lateCriteria = useDeferredValue(criteria);
  const updating = lateAnswers !== answers || lateCriteria !== criteria;
  const computed = useMemo(() => {
    const r = proposalsUnder(deal, loaded.bls, loaded.commodities, lateCriteria, lateAnswers);
    const ordered = orderByRules(r.proposals, rulesOf(lateCriteria), byNo, waysOf(lateAnswers));
    return { reason: r.reason, pool: distinctProposals(ordered, targetOf(deal.remainingUsd, lateCriteria)).slice(0, 20) };
  }, [deal, loaded, lateCriteria, lateAnswers, byNo]);
  const poolKey = computed.pool.map(c => c.bls.join('+')).join('|');

  // The AI ranks the valid proposals and explains them; it never adds one. Without it, the app's own order stands.
  useEffect(() => {
    if (!computed.pool.length) return;
    let live = true;
    const pool = computed.pool;
    const used = [...new Set(pool.flatMap(c => c.bls))].map(no => byNo.get(no) ?? {});
    data.ai({
      deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity, dealUsd: deal.usd ?? '', remainingUsd: deal.remainingUsd },
      candidates: pool, preferences: '',
      // BL details only while they fit the request (a deal can take 200-300 BLs); beyond that the AI ranks on the totals.
      bls: used.length > AI_BL_ROWS ? [] : used.map(b => ({ blNo: str(b.blNo), tfNo: str(b.tfNo), tfDate: str(b.tfDate), quantity: str(b.quantity), usdValue: str(b.usdValue) }))
    }).then(answer => {
      if (!live) return;
      const ai = answer.model !== 'none';
      const list = ai ? answer.ranked.filter(r => pool[r.index]).map(r => ({ combo: pool[r.index], reason: r.reason })) : [];
      setRanked({ key: poolKey, list, model: answer.model });
    }, () => { if (live) setRanked({ key: poolKey, list: [], model: 'none' }); });
    return () => { live = false; };
  }, [computed, poolKey, byNo, data, deal]);

  // Examples for the bar, made of this deal's own free BLs (so each one does something when applied).
  const examples = useMemo(() => {
    const free = candidates(loaded.bls, deal.tsfCommodity, loaded.commodities, {}).sort((a, b) => str(a.blNo).localeCompare(str(b.blNo)));
    if (!free.length) return [];
    const at = (f: number) => str(free[Math.min(free.length - 1, Math.floor(free.length * f))].blNo);
    const most = (f: string) => { const n = new Map<string, number>(); for (const b of free) if (str(b[f])) n.set(str(b[f]), (n.get(str(b[f])) ?? 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''; };
    const first = free.map(b => str(b.blDate).slice(5, 7)).filter(Boolean).sort()[0];
    const month = first ? MONTH_NAMES[Number(first) - 1] : '';
    const contract = most('contractRef');
    return [`exclude BLs ${at(0.1)} to ${at(0.2)}`, month ? `BL date in ${month}` : '', contract ? `only contract ${contract}` : '', 'top 10 largest BLs', 'BLs above 50K', 'fill 50%', 'min 300 BLs'].filter(Boolean);
  }, [loaded, deal.tsfCommodity]);
  // A chip applies at once (the bar stays clear for the next condition).
  // The names the deal's free BLs carry: a notify party or contract typed on its own is understood.
  const known = useMemo(() => {
    const free = candidates(loaded.bls, deal.tsfCommodity, loaded.commodities, {});
    const uniq = (f: string) => [...new Set(free.map(b => str(b[f])).filter(Boolean))].slice(0, 200);
    return { notifyParty: uniq('notifyParty'), contractRef: uniq('contractRef') };
  }, [loaded, deal.tsfCommodity]);
  const use = (text: string) => { void apply(text); input.current?.focus(); };
  const remove = (id: number) => onEntries(entries.filter(e => e.id !== id));
  const [hintAt, setHintAt] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHintAt(n => n + 1), 3500);
    return () => clearInterval(t);
  }, []);
  const hint = examples.length ? examples[hintAt % examples.length] : '';

  const aiOrder = ranked?.key === poolKey && ranked.list.length ? ranked.list : null;
  const proposals: Proposal[] = (aiOrder ?? computed.pool.map(c => ({ combo: c, reason: '' }))).slice(0, SHOWN);
  const model = ranked?.key === poolKey ? ranked.model : '';

  // Each way turns on and off; none chosen means all three.
  const toggleFill = (f: Fill) => {
    onAnswers({ ...answers, fill: answers.fill.includes(f) ? answers.fill.filter(x => x !== f) : [...answers.fill, f] });
  };
  /** Clear all: every way of filling back on, no conditions, an empty bar. */
  // Clear all: no way chosen (the proposals then use all three), no conditions, an empty bar.
  const clearAll = () => { onAnswers({ ...DEFAULT_ANSWERS, fill: [] }); onEntries([]); setTyped(''); setReply(null); };

  const apply = async (given?: string) => {
    const text = (given ?? typed).trim() || hint;
    if (!text) return;
    // "clear", "reset", "start over": the same as Clear all.
    if (/^(?:clear|reset|clear all|reset all|start over|remove all|undo all)$/i.test(text)) { clearAll(); setReply({ applied: ['cleared every condition and way of filling'], notUnderstood: [] }); return; }
    setReadingBusy(true);
    try {
      const read = await data.interpret(text, { deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity }, commodities: loaded.commodities, today: todayIso(), known });
      // "top 10 largest BLs" becomes the BL numbers of this deal's free BLs (listed in the chip's tooltip).
      const top = resolveTop(read.criteria, candidates(loaded.bls, deal.tsfCommodity, loaded.commodities, {}));
      const reading = top.picked.length ? { ...read, criteria: top.criteria, picked: top.picked } : read;
      // "fewest BLs" / "closest amount" typed in the bar choose the way of filling (the Fill with chips show it).
      if (reading.criteria.ways?.length) onAnswers({ ...answers, fill: reading.criteria.ways });
      onEntries(list => [...list, { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, text, reading }]);
      setReply({ applied: reading.applied, notUnderstood: reading.notUnderstood });
      setTyped('');
    }
    catch (e) { onError((e as Error).message); }
    finally { setReadingBusy(false); }
  };
  const accept = async (p: Proposal) => {
    if (busy) return;
    setBusy(true);
    try {
      const values = Object.fromEntries(p.combo.bls.map(no => [no, str(byNo.get(no)?.usdValue)]));
      await data.assign({ dealId: deal.dealId, usd: deal.usd }, acceptPlan(p.combo, loaded.bls), values);
      setOpen(null);
      setTab('assigned');
      onChanged(`${p.combo.bls.length} BL${p.combo.bls.length > 1 ? 's' : ''} assigned to ${deal.dealId}`);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const pct = progressPct(deal);
  const outside = proposals.some(p => p.combo.fit);

  return (
    <>
      <div className="panel tsf-dealhero">
        <div className="tsf-dealhero__id">
          <div className="tsf-dealhero__nav">
            <button type="button" className="button secondary small" onClick={nav.back}><ArrowLeft size={14} />All Deal IDs</button>
            <span className="tsf-propose__muted">{nav.at} of {nav.of}</span>
            <button type="button" className="button secondary small" disabled={!nav.prev} onClick={() => nav.go(nav.prev)} aria-label="Previous Deal ID" title={nav.prev ? `Previous: ${nav.prev}` : undefined}><ChevronLeft size={14} /></button>
            <button type="button" className="button secondary small" disabled={!nav.next} onClick={() => nav.go(nav.next)} aria-label="Next Deal ID" title={nav.next ? `Next: ${nav.next}` : undefined}><ChevronRight size={14} /></button>
          </div>
          <h2><span className="mono">{deal.dealId}</span> <StateTag deal={deal} /><span className="tsf-propose__muted tsf-dealhero__desc">{deal.tsfCommodityText || deal.tsfCommodity || 'no commodity'}{deal.dealDesc ? ` · ${deal.dealDesc}` : ''}</span></h2>
          <div className="tsf-dealhero__bar">
            <div className="tsf-propose__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Assigned share of the deal"><span style={{ width: `${pct}%` }} /></div>
            <span>{pct}% assigned · {assignedCountHere} BL{assignedCountHere === 1 ? '' : 's'}</span>
          </div>
        </div>
        <dl className="tsf-dealhero__figs">
          <div><dt>Deal amount</dt><dd>{formatCompact(deal.amount)} <small>{deal.currency}</small></dd><span>{formatAmount4(deal.amount)}</span></div>
          <div className="key"><dt>{Number(deal.remainingUsd) < 0 ? 'Over by' : 'Unassigned'}</dt><dd>{deal.remainingUsd ? formatCompact(Math.abs(Number(deal.remainingUsd))) : '—'} <small>USD</small></dd><span>{deal.remainingUsd ? formatAmount4(Math.abs(Number(deal.remainingUsd)).toFixed(2)) : ''}</span></div>
        </dl>
      </div>
      {deal.dealStatus !== undefined && assignStatusProblem(deal.dealId, deal.dealStatus) && <Notice kind="warn">{assignStatusProblem(deal.dealId, deal.dealStatus)}</Notice>}
      {deal.status === 'No USD rate' && <Notice kind="warn">No USD rate for {deal.currency} today: this Deal ID gets no proposals until SAP has one (rate type M).</Notice>}
      {deal.status === 'Filled' && <Notice>This Deal ID is fully assigned (within 1%).</Notice>}
      {note && <Notice kind="warn">{note}</Notice>}

      <div className="tsf-propose__tabrow">
        <div className="tsf-tabs tsf-propose__tabs" role="tablist" aria-label={`${deal.dealId} views`}>
          <button role="tab" aria-selected={tab === 'proposals'} className={tab === 'proposals' ? 'on' : ''} onClick={() => setTab('proposals')}>Proposals<span className="count">{deal.status === 'Open' ? proposals.length : 0}</span></button>
          <button role="tab" aria-selected={tab === 'assigned'} className={tab === 'assigned' ? 'on' : ''} onClick={() => setTab('assigned')}>Assigned BLs<span className="count">{assignedCountHere}</span></button>
        </div>
      {tab === 'proposals' && deal.status === 'Open' && (
      <div className="tsf-propose__options">
        <div role="group" aria-label="Fill the deal with">
          <span>Fill with</span>
          {FILLS.map(([id, label]) => <button key={id} className={`tsf-propose__opt${answers.fill.includes(id) ? ' on' : ''}`} aria-pressed={answers.fill.includes(id)} onClick={() => toggleFill(id)}>{label}</button>)}
          <button type="button" className="tsf-propose__reset" aria-label="Clear all selections and conditions" onClick={clearAll}><X size={12} />Clear all</button>
          {!answers.fill.length && <span className="tsf-propose__allways">All ways</span>}
        </div>
        {criteria.target && <span className="tsf-propose__aim">Aiming at <b>{formatAmount4(aimUsd)} USD</b> of {formatAmount4(deal.remainingUsd)} left</span>}
      </div>
      )}
      </div>

      {tab === 'proposals' && deal.status !== 'Open' && <p className="tsf-propose__muted tsf-propose__pad">No proposals: {deal.status === 'Filled' ? 'the deal is fully assigned.' : 'the deal has no USD rate.'}</p>}
      {tab === 'proposals' && deal.status === 'Open' && (
        <div className="panel tsf-propose__proposals">
          <form className="tsf-cmd" onSubmit={e => { e.preventDefault(); void apply(); }}>
            <div className="tsf-cmd__bar">
              <span className="tsf-cmd__ai" aria-hidden="true"><Sparkles size={14} /></span>
              <input ref={input} value={typed} onChange={e => setTyped(e.target.value)} aria-label="Conditions"
                placeholder={hint ? `Ask anything, e.g. ${hint}` : 'Ask anything: which BLs to use, leave out, how many…'} />
              <button className="button small" disabled={reading_ || (!typed.trim() && !hint)} title={typed.trim() ? undefined : `Applies: ${hint}`}>{reading_ ? 'Thinking…' : 'Apply'}</button>
            </div>
            {(reading_ || reply) && (
              <div className="tsf-cmd__reply" role="status" aria-live="polite">
                <span className="tsf-cmd__ai" aria-hidden="true"><Sparkles size={12} /></span>
                {reading_ ? <p className="tsf-cmd__typing" aria-label="Thinking"><i /><i /><i /></p> : reply && (
                  <p>{reply.applied.length > 0 && <>Done: {reply.applied.map(short).join('; ')}. {updating ? 'Updating the proposals…' : proposals.length ? `${proposals.length} proposal${proposals.length > 1 ? 's' : ''} below.` : 'No proposal fits that: remove a condition to widen it.'}</>}
                    {reply.notUnderstood.length > 0 && <> I could not place “{reply.notUnderstood.map(n => n.replace(/\s*\([^)]*\)\s*$/, '')).join('; ')}”. Try words like <i>top 10 largest BLs</i>, <i>exclude …</i>, <i>min 300 BLs</i> or <i>BLs above 50K</i>.</>}
                    <button type="button" className="tsf-cmd__x" aria-label="Dismiss the answer" onClick={() => setReply(null)}><X size={11} /></button></p>
                )}
              </div>
            )}
            <div className="tsf-cmd__try" aria-label="Examples to try">
              {examples.length > 0 && <span>Try</span>}
              {examples.map(x => <button key={x} type="button" className="tsf-cmd__eg" onClick={() => use(x)}>{x}</button>)}
              <details className="tsf-cmd__help">
                <summary><HelpCircle size={13} />What can I type?</summary>
                <div className="tsf-cmd__guide">
                  {GUIDE.map(([title, list]) => (
                    <div key={title}><h5>{title}</h5>{list.map(x => <button key={x} type="button" className="tsf-cmd__eg" onClick={() => use(x)}>{x}</button>)}</div>
                  ))}
                  <p>Type it the way you would say it: include, exclude, only, min, max, at least, top, largest, oldest… Conditions stack; remove any with its ×. Anything not understood is said so, never guessed.</p>
                </div>
              </details>
            </div>
          </form>
          {entries.length > 0 && (
            <div className="tsf-propose__understood" aria-label="Applied conditions">
              {entries.map(e => (
                <span key={e.id} className="tsf-cmd__chip" title={[e.text, ...(e.reading.picked ?? [])].join('\n')}>
                  {e.reading.applied.map(a => <span key={a} className="tsf-propose__rule">{short(a)}</span>)}
                  {e.reading.notUnderstood.map(n => <span key={n} className="tsf-propose__not">Not applied: {n}</span>)}
                  <button type="button" className="tsf-cmd__x" aria-label={`Remove condition: ${e.text}`} onClick={() => remove(e.id)}><X size={11} /></button>
                </span>
              ))}
              <button className="tsf-propose__link" aria-label="Clear conditions" onClick={() => { onEntries([]); setTyped(''); setReply(null); }}><X size={12} />Clear conditions</button>
            </div>
          )}

          {updating && <p className="tsf-propose__updating" role="status"><span aria-hidden="true" />Updating proposals…</p>}
          {computed.reason && <p className="tsf-propose__none" role="status">{computed.reason}</p>}
          {!computed.reason && outside && <p className="tsf-propose__hint">Nothing comes within 1% of {usd(aimUsd)}: these are the closest. <b>Covers the deal</b> caps its last BL at what is left; <b>Partial fill</b> leaves part open.</p>}
          {proposals.length > 0 && (
            <div className="tsf-propose__listwrap"><DataTable nativeLayout nativeExport aria-label="Proposals" className="tsf-propose__list">
              <thead><tr><th>Proposal</th><th className="num">Assigns (USD)</th><th className="num">{criteria.target ? 'vs aim' : 'vs left'}</th><th className="num">BLs</th><th>BL dates</th></tr></thead>
              <tbody>{proposals.map((p, i) => {
                const rows = p.combo.bls.map(no => byNo.get(no) ?? {});
                const dates = rows.map(r => str(r.blDate) || str(r.tfDate)).filter(Boolean).sort();
                const way = `${p.combo.kinds?.map(k => WAY[k]?.name).filter(Boolean).join(' · ') ?? ''}${(p.combo.alt ?? 1) > 1 ? ` · alt. ${p.combo.alt}` : ''}`;
                const note = p.combo.kinds?.[0] ? WAY[p.combo.kinds[0]]?.note : '';
                const nos = p.combo.bls;
                const label = `${p.combo.fit ? FIT_LABEL[p.combo.fit] : i === 0 ? 'Best match' : `Option ${i + 1}`}${way ? ` · ${way}` : ''}`;
                return (
                  <tr key={nos.join('+')} data-table-row="" className={i === 0 ? 'best' : ''} onDoubleClick={() => setOpen(p)}>
                    <td><button className="tsf-propose__link tsf-propose__open" title={note} onClick={() => setOpen(p)} aria-label={`Proposal ${i + 1}: ${nos.length} BLs, ${assignedTotal(p.combo, aimUsd)} USD`}>{i + 1}. {label}</button>
                      {p.reason && <span className="tsf-propose__reason" title={p.reason}><Sparkles size={11} />{p.reason}</span>}</td>
                    <td className="num"><b>{formatAmount4(assignedTotal(p.combo, aimUsd))}</b>{p.combo.cap && <small className="tsf-propose__sub">BL {p.combo.cap.blNo} capped at {formatAmount4(p.combo.cap.usd)}</small>}</td>
                    <td className="num"><span className={`tsf-propose__match${p.combo.fit ? ' out' : Math.abs(p.combo.diffPct) <= 0.1 ? ' exact' : ''}`}>{p.combo.cap ? 'fills exactly' : `${p.combo.diffPct > 0 ? '+' : ''}${p.combo.diffPct.toFixed(2)}%`}</span></td>
                    <td className="num">{nos.length}</td>
                    <td className="tsf-propose__nowrap tsf-propose__bls" title={`${dates.length ? `${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}
` : ''}BLs: ${nos.join(', ')}`}>{dates.length ? `${formatDate(dates[0]).slice(0, 5)} → ${formatDate(dates[dates.length - 1]).slice(0, 5)}` : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </DataTable></div>
          )}
          {model && model !== 'none' && proposals.length > 0 && <p className="tsf-propose__muted">Ranked and explained by {model}; every amount is calculated by the app.</p>}
        </div>
      )}

      {tab === 'assigned' && (
        <div className="panel tsf-propose__assigned">
          <h3>Assigned BLs <span>{assignedCountHere}</span></h3>
          <AssignedGroups dealId={deal.dealId} bls={loaded.bls} />
        </div>
      )}

      {open && <ProposalModal proposal={open} rank={Math.max(1, proposals.findIndex(p => p.combo.bls.join('+') === open.combo.bls.join('+')) + 1)} deal={deal} aimUsd={aimUsd} bls={byNo} busy={busy}
        onClose={() => setOpen(null)} onAccept={() => { void accept(open); }}
        onDrop={nos => {
          // The BLs unticked in the proposal leave the pool: a condition like any typed one, removable with its ×.
          const text = `exclude BL ${nos.join(', ')}`;
          onEntries(list => [...list, { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, text, reading: { ...readConditions(text, loaded.commodities), model: 'none' } }]);
          setOpen(null);
        }} />}
    </>
  );
}
