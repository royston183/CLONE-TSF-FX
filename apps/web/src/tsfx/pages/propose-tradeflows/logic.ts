// Propose Tradeflows: the figures of each Deal ID and the proposals for it (pure, tested).
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { assignedTotal, candidates, closestCombinations, findFewest, findFewestGroups, findOldest, findTight, remaining, toUsd, TOLERANCE_PCT, type Combination, type Rules } from '@tsfx/lib/propose/match';
import { blUnavailable, dealMismatch, filterBls, hasCriteria, type Criteria, targetOf } from '@tsfx/lib/propose/query';
import type { Deal } from './data';

import { canMove } from './status-rules';

export interface DealRow extends Deal {
  /** The Deal Amount in USD (null without a rate). */
  usd: string | null;
  assignedUsd: string;
  remainingUsd: string;
  status: 'Open' | 'Filled' | 'No USD rate';
}

const cents = (v: string) => Math.round(Number(v) * 100);
const money = (c: number) => (c / 100).toFixed(2);

/** Each Deal ID with its USD amount, what its active BLs were assigned with, and what is left. */
export function dealRows(deals: Deal[], bls: Row[], rates: Record<string, string>): DealRow[] {
  return deals.map(d => {
    const usd = toUsd(d.amount, d.currency, rates);
    const mine = bls.filter(b => str(b.dealId) === d.dealId && str(b.deletedFlag) !== 'X');
    const assignedUsd = money(mine.reduce((s, b) => s + cents(str(b.assignedUsd) || '0'), 0));
    if (usd === null) return { ...d, usd, assignedUsd, remainingUsd: '', status: 'No USD rate' };
    const left = remaining(usd, mine);
    const filled = Math.abs(cents(left)) <= Math.round(cents(usd) * TOLERANCE_PCT / 100);
    return { ...d, usd, assignedUsd, remainingUsd: left, status: filled ? 'Filled' : 'Open' };
  });
}

/**
 * How the proposals are built; both lists are multiple choice.
 * fill: fewest = the fewest BLs, bigger first; closest = closest to the amount; oldest = oldest trade flows first (they
 * order the proposals in the order chosen). overflow (when nothing comes within 1%): cap = the last BL gives only what is
 * left, so the deal ends filled; partial = sets of full BL values that fill part of the deal. Neither: no proposal.
 */
export type Fill = 'fewest' | 'closest' | 'oldest' | 'contracts' | 'parties';
export type Overflow = 'cap' | 'partial';
export interface FillAnswers { fill: Fill[]; overflow: Overflow[] }
// Both kinds of closest proposal by default: a deal larger than all its free BLs still gets the fullest partial fill.
// Every way of filling by default, so the first look shows really different proposals to weigh.
export const DEFAULT_ANSWERS: FillAnswers = { fill: ['fewest', 'closest', 'oldest'], overflow: ['cap', 'partial'] };
/** The ways used: those chosen, or (none chosen, e.g. after Clear all) all three. */
export const waysOf = (a: FillAnswers): Fill[] => (a.fill.length ? a.fill : ['fewest', 'closest', 'oldest']);
/** How many proposals the list aims at. */
export const WANTED = 6;
/** Two proposals sharing this share of their BLs count as the same proposal. */
const SAME = 0.8;
/** Sets found per way of filling, by the free BLs, the amount, the rules and the way (see proposalsFor). */
const WAYS = new Map<string, { list: Combination[]; pool: Row[]; done: boolean }>();
/** A short fingerprint of a list of BLs (their numbers and values). */
function fingerprint(rows: Row[]): string {
  let h = 2166136261;
  for (const b of rows) for (const ch of `${str(b.blNo)}:${str(b.usdValue)};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `${rows.length}-${(h >>> 0).toString(36)}`;
}
const overlap = (a: string[], b: string[]) => { const s = new Set(a); const n = b.filter(x => s.has(x)).length; return n / Math.max(a.length, b.length, 1); };

/**
 * The BL combinations for what is left of a Deal ID (none without a USD rate or once it is filled): those within the
 * tolerance, or, when there are none, the closest ones (marked by `fit`) of the kinds chosen. With "fewest" the search
 * keeps to the fewest BLs, the bigger first.
 */
export function proposalsFor(deal: DealRow, bls: Row[], commodities: Row[], rules: Rules, answers: FillAnswers = DEFAULT_ANSWERS): Combination[] {
  if (deal.status !== 'Open') return [];
  const cands = candidates(bls, deal.tsfCommodity, commodities, rules);
  // Each way of filling searches on its own; each gives its best set and, for a choice, alternatives that leave out a
  // fifth of the BLs of the one before (so they really differ). Sets sharing 80% of their BLs are one proposal.
  const fills = waysOf(answers);
  const search = (f: Fill, pool: Row[]) => (f === 'fewest' ? findFewest(pool, deal.remainingUsd, rules) : f === 'closest' ? findTight(pool, deal.remainingUsd, rules)
    : f === 'oldest' ? findOldest(pool, deal.remainingUsd, rules) : findFewestGroups(pool, deal.remainingUsd, rules, f === 'contracts' ? 'contractRef' : 'notifyParty'));
  const must = new Set(rules.includeBl ?? []);
  const exact: Combination[] = [];
  const each = Math.max(1, Math.ceil(WANTED / fills.length));
  // Each way's sets are kept (same free BLs, amount and rules): turning a way off and on again is instant, and asking a
  // way for more alternatives continues where it stopped.
  const base = `${fingerprint(cands)}|${deal.remainingUsd}|${JSON.stringify(rules)}`;
  const setsOf = (f: Fill): Combination[] => {
    const key = `${base}|${f}`;
    const got = WAYS.get(key) ?? { list: [] as Combination[], pool: cands, done: false };
    while (got.list.length < each && !got.done) {
      const best = search(f, got.pool)[0];
      if (!best) { got.done = true; break; }
      got.list.push(best);
      const drop = new Set(best.bls.filter((no, k) => k % 5 === 0 && !must.has(no)));
      got.pool = got.pool.filter(b => !drop.has(str(b.blNo)));
    }
    if (WAYS.size > 300) WAYS.clear();
    WAYS.set(key, got);
    return got.list.slice(0, each);
  };
  for (const f of fills) {
    for (const best of setsOf(f)) {
      // The same proposal: most BLs shared, and about the same amount and size (so a closer or smaller set stays its own).
      const same = exact.find(c => overlap(c.bls, best.bls) >= SAME && Math.abs(Math.abs(c.diffPct) - Math.abs(best.diffPct)) <= 0.05 && Math.abs(c.bls.length - best.bls.length) <= 2);
      if (same) { if (!same.kinds?.includes(f)) same.kinds = [...(same.kinds ?? []), f]; }
      else exact.push({ ...best, kinds: [f], alt: exact.filter(c => c.kinds?.[0] === f).length + 1 });
    }
  }
  if (exact.length) return exact;
  return closestCombinations(cands, deal.remainingUsd, rules).filter(c => (c.fit === 'over' ? answers.overflow.includes('cap') : answers.overflow.includes('partial')));
}

/** Proposals that look the same to the person (same amount assigned, same number of BLs) shown once: the first one. */
export function distinctProposals<C extends Combination>(list: C[], remainingUsd: string): C[] {
  const seen = new Set<string>();
  return list.filter(c => {
    const key = `${assignedTotal(c, remainingUsd)}|${c.bls.length}|${c.fit ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The matcher's rules the criteria carry (the rest of the criteria filter the BLs before the matcher sees them). */
export function rulesOf(c: Criteria): Rules {
  return {
    ...(c.maxBls ? { maxBls: c.maxBls } : {}), ...(c.minBls ? { minBls: c.minBls } : {}),
    ...(c.bl.include?.length ? { includeBl: c.bl.include } : {}),
    ...(c.order?.older ? { preferOlder: true } : {}), ...(c.order?.newer ? { preferNewer: true } : {}), ...(c.order?.fewerTfs ? { preferFewerTfs: true } : {})
  };
}

export const NO_MATCH = 'No matching deals or available BLs found for the selected criteria.';

/**
 * The proposals for a deal under the typed criteria, or why there are none. Only real, free, priced BLs of the deal's
 * commodity that satisfy every condition are used; a BL the criteria require must be available, or nothing is proposed.
 * Nothing unrelated is offered when the criteria leave nothing.
 */
export function proposalsUnder(deal: DealRow, bls: Row[], commodities: Row[], criteria: Criteria, answers: FillAnswers): { proposals: Combination[]; reason: string } {
  if (deal.status !== 'Open') return { proposals: [], reason: '' };
  const mismatch = dealMismatch(deal, criteria, commodities);
  if (mismatch) return { proposals: [], reason: `${NO_MATCH} Deal ID ${deal.dealId}: ${mismatch}` };
  for (const no of criteria.bl.include ?? []) {
    const why = blUnavailable(no, bls, deal);
    if (why) return { proposals: [], reason: `${NO_MATCH} ${why}` };
  }
  const pool = filterBls(bls, criteria, commodities);
  const rules = rulesOf(criteria);
  const free = candidates(pool, deal.tsfCommodity, commodities, rules);
  for (const no of criteria.bl.include ?? []) {
    if (!free.some(b => str(b.blNo) === no)) return { proposals: [], reason: `${NO_MATCH} BL ${no} is not a free ${deal.tsfCommodity} BL under these conditions.` };
  }
  if (!free.length) return { proposals: [], reason: hasCriteria(criteria) ? NO_MATCH : `No free, priced BL of ${deal.tsfCommodity}${deal.tsfCommodityText ? ` (${deal.tsfCommodityText})` : ''}: upload its trade flows and set their price in Update Price.` };
  // "fill 50%" / "propose 1 Cr": the proposals aim at that part of what is left.
  const aim = criteria.target ? { ...deal, remainingUsd: targetOf(deal.remainingUsd, criteria) } : deal;
  const found = proposalsFor(aim, pool, commodities, rules, answers);
  if (!found.length) return { proposals: [], reason: hasCriteria(criteria) ? NO_MATCH : `No combination of the ${free.length} free ${deal.tsfCommodity} BLs fits the options chosen.` };
  return { proposals: found, reason: '' };
}

/** A Deal ID's assigned BLs, grouped by trade flow (largest first), with each group's and the overall USD. */
export interface AssignedGroup { tfNo: string; tfDate: string; bls: Row[]; usd: string; quantity: string }
export function assignedByTradeflow(dealId: string, bls: Row[]): { groups: AssignedGroup[]; usd: string; count: number } {
  const mine = bls.filter(b => str(b.dealId) === dealId && str(b.deletedFlag) !== 'X');
  const map = new Map<string, Row[]>();
  for (const b of mine) { const k = `${str(b.tfNo)}|${str(b.tfDate)}`; map.set(k, [...(map.get(k) ?? []), b]); }
  const sum = (rows: Row[], f: string) => rows.reduce((s, b) => s + Math.round(Number(str(b[f]) || 0) * (f === 'quantity' ? 1000 : 100)), 0);
  const groups = [...map.values()].map(rows => ({
    tfNo: str(rows[0].tfNo), tfDate: str(rows[0].tfDate),
    bls: [...rows].sort((a, b) => Number(str(b.assignedUsd)) - Number(str(a.assignedUsd))),
    usd: money(sum(rows, 'assignedUsd')), quantity: (sum(rows, 'quantity') / 1000).toFixed(3)
  })).sort((a, b) => cents(b.usd) - cents(a.usd) || a.tfNo.localeCompare(b.tfNo));
  return { groups, usd: money(sum(mine, 'assignedUsd')), count: mine.length };
}

/** What accepting a proposal stores: each BL with the USD value it was matched with (the capped BL: what was left). */
export function acceptPlan(combo: Combination, bls: Row[]): Record<string, string> {
  return Object.fromEntries(combo.bls.map(no => [no, combo.cap?.blNo === no ? combo.cap.usd : str(bls.find(b => b.blNo === no)?.usdValue)]));
}

/** Why a Deal ID gets no proposal at all: no free BL of its commodity, or none that the preferences allow. */
export function noProposalReason(deal: DealRow, bls: Row[], commodities: Row[], rules: Rules): string {
  const free = candidates(bls, deal.tsfCommodity, commodities, {});
  if (!free.length) return `No free, priced BL of ${deal.tsfCommodity}${deal.tsfCommodityText ? ` (${deal.tsfCommodityText})` : ''}: upload its trade flows and set their rate in Update List.`;
  return candidates(bls, deal.tsfCommodity, commodities, rules).length
    ? `No combination of the free ${deal.tsfCommodity} BLs fits these preferences.`
    : `The preferences leave none of the ${free.length} free ${deal.tsfCommodity} BLs.`;
}

/** The BLs of the deal's commodity that may be proposed, and why a commodity has none (no TSF FX Commodity set). */
export function commodityNote(deal: Deal, commodities: Row[]): string {
  return commodities.some(c => str(c.tsfCommodity) === deal.tsfCommodity) ? ''
    : `No commodity in Maintain Commodity points to ${deal.tsfCommodity}${deal.tsfCommodityText ? ` (${deal.tsfCommodityText})` : ''}: set its TSF FX Commodity to get proposals.`;
}

/** The rules the AI understood, as short chips. */
const RULE_TEXT: Record<string, (v: unknown) => string> = {
  maxBls: v => `at most ${String(v)} BLs`, minBls: v => `at least ${String(v)} BLs`,
  includeTf: v => `only trade flows ${(v as string[]).join(', ')}`, excludeTf: v => `not trade flows ${(v as string[]).join(', ')}`,
  includeBl: v => `always BL ${(v as string[]).join(', ')}`, excludeBl: v => `never BL ${(v as string[]).join(', ')}`,
  preferOlder: () => 'older trade flows first', preferNewer: () => 'newer trade flows first', preferFewerTfs: () => 'fewer trade flows',
  tolerancePct: v => `within ${String(v)}%`
};
export const ruleChips = (rules: Rules): string[] => Object.entries(rules).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => RULE_TEXT[k]?.(v) ?? k);


/** The deal an acceptance is for, as it was when the proposal was shown. */
export interface AssignTarget { dealId: string; usd: string | null }

/**
 * Why an acceptance must not be written, checked on the BLs read again from SAP just before the write: each BL once,
 * still there, not deleted, not assigned (to this or another deal: a repeated or concurrent acceptance), given no more
 * than its USD value; and the deal not taking more than what is left of it (plus the 1% tolerance). [] when it may.
 */
export function assignmentProblems(target: AssignTarget, plan: Record<string, string>, blNos: readonly string[], fresh: Row[], values: Record<string, string>): string[] {
  const out: string[] = [];
  if (!blNos.length) return ['The proposal has no BLs.'];
  const dup = blNos.filter((n, i) => blNos.indexOf(n) !== i);
  if (dup.length) out.push(`BL ${[...new Set(dup)].join(', ')} is in the proposal more than once.`);
  if (target.usd === null) return [...out, `Deal ID ${target.dealId} has no USD rate.`];
  let total = 0;
  for (const no of new Set(blNos)) {
    const b = fresh.find(x => str(x.blNo) === no);
    const amount = Number(plan[no]);
    if (!b) { out.push(`BL ${no} no longer exists.`); continue; }
    if (str(b.deletedFlag) === 'X') { out.push(`BL ${no} was deleted.`); continue; }
    if (str(b.dealId)) { out.push(str(b.dealId) === target.dealId ? `BL ${no} is already assigned to this deal.` : `BL ${no} was assigned to Deal ID ${str(b.dealId)} meanwhile.`); continue; }
    if (!(amount > 0)) { out.push(`BL ${no} would be assigned no amount.`); continue; }
    const value = Number(values[no]);
    if (value > 0 && amount > value + 0.005) out.push(`BL ${no} would be assigned ${amount.toFixed(2)} USD, more than its value of ${value.toFixed(2)} USD.`);
    total += Math.round(amount * 100);
  }
  const left = Number(remaining(target.usd, fresh.filter(b => str(b.dealId) === target.dealId)));
  const limit = Math.round(left * 100) + Math.round(Math.round(Number(target.usd) * 100) * TOLERANCE_PCT / 100);
  if (!out.length && total > limit) out.push(`The proposal (${(total / 100).toFixed(2)} USD) is more than what is left of Deal ID ${target.dealId} (${left.toFixed(2)} USD) plus 1%.`);
  return out;
}

/** The Deal ID status once BLs are assigned to it ("04 - BL Assigned to Deal ID for Invoicing"). */
export const BL_ASSIGNED_STATUS = '04';

/**
 * The status a Deal ID moves to when it has active BLs assigned: 04, and only from 03 (marked for invoicing): the app does not skip
 * a stage. A Deal ID already at 04 or beyond is never moved back; null means leave it (see status-rules.ts).
 */
export function statusWithBls(status: string): string | null {
  return canMove(status, BL_ASSIGNED_STATUS) ? BL_ASSIGNED_STATUS : null;
}

/** The Deal IDs that have an active BL assigned (what the status follows). */
export const dealsWithBls = (bls: Row[]): string[] => [...new Set(bls.filter(b => str(b.dealId) && str(b.deletedFlag) !== 'X').map(b => str(b.dealId)))];

/* ------------------------------------------------------------------ deal list: total, utilized, balance (USD Mn) */

/** What the deal list shows for one Deal ID. All amounts are USD strings (cents); null when SAP gave no figure. */
export interface DealFigures {
  total: string | null;
  utilized: string;
  balance: string | null;
  /** Balance / total × 100, two decimals; null for a missing or zero total. */
  remainingPct: string | null;
  /** Why a figure is missing or suspect (shown as a flag), '' when the figures are consistent. */
  issue: string;
}

export function dealFigures(d: DealRow): DealFigures {
  const total = d.usd;
  const utilized = d.assignedUsd;
  if (total === null || !Number.isFinite(Number(total))) return { total: null, utilized, balance: null, remainingPct: null, issue: 'The deal has no USD amount (no USD rate), so total, balance and remaining % cannot be worked out.' };
  const balance = money(cents(total) - cents(utilized));
  const totalCents = cents(total);
  const pct = totalCents > 0 ? ((cents(balance) / totalCents) * 100).toFixed(2) : null;
  const issue = totalCents <= 0 ? 'The deal amount is zero.' : cents(balance) < 0 ? 'More is assigned than the deal amount: shown as SAP holds it.' : '';
  return { total, utilized, balance, remainingPct: pct, issue };
}

/** USD → USD millions, two decimals with thousands separators ('23894000' → '23.89'); '—' when there is no figure. */
export function usdMn(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '—';
  return (Number(v) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const pctText = (p: string | null): string => (p === null ? '—' : `${Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

/** Totals of a list of deals; a deal without a total is left out of the sums. */
export function dealTotals(deals: DealRow[]): DealFigures {
  let total = 0, utilized = 0, balance = 0, counted = 0;
  for (const d of deals) {
    const f = dealFigures(d);
    utilized += cents(f.utilized);
    if (f.total === null || f.balance === null) continue;
    total += cents(f.total); balance += cents(f.balance); counted++;
  }
  return { total: money(total), utilized: money(utilized), balance: money(balance), remainingPct: total > 0 ? ((balance / total) * 100).toFixed(2) : null, issue: counted < deals.length ? `${deals.length - counted} deal(s) without a USD amount are left out of the total and balance.` : '' };
}
