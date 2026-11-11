// Propose Tradeflows: figures the screen shows (pure, tested).
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { Rules } from '@tsfx/lib/propose/match';

const cents = (v: string) => Math.round(Number(v || 0) * 100);

/** How well a proposal matches what is left: 100% minus the difference. */
export const matchPct = (diffPct: number): string => `${(100 - Math.abs(diffPct)).toFixed(1)}%`;

/** The share of a deal already assigned (0–100). */
export function progressPct(d: { usd: string | null; assignedUsd: string }): number {
  if (!d.usd || !(Number(d.usd) > 0)) return 0;
  return Math.min(100, Math.round((cents(d.assignedUsd) / cents(d.usd)) * 100));
}

/** Each BL's share of a proposal's total (whole percent). */
export function contributions(bls: { blNo: string; usdValue: string }[]): { blNo: string; pct: number }[] {
  const total = bls.reduce((s, b) => s + cents(b.usdValue), 0);
  return bls.map(b => ({ blNo: b.blNo, pct: total ? Math.round((cents(b.usdValue) / total) * 100) : 0 }));
}

/** The page header: open and filled deals, the USD still open, and the free BLs (active, unassigned, priced). */
export function kpis(deals: { status: string; remainingUsd: string }[], bls: Row[]) {
  const open = deals.filter(d => d.status === 'Open');
  const free = bls.filter(b => !str(b.dealId) && str(b.deletedFlag) !== 'X' && Number(b.usdValue) > 0);
  return {
    open: open.length,
    filled: deals.filter(d => d.status === 'Filled').length,
    openUsd: (open.reduce((s, d) => s + cents(d.remainingUsd), 0) / 100).toFixed(2),
    freeBls: free.length,
    freeUsd: (free.reduce((s, b) => s + cents(str(b.usdValue)), 0) / 100).toFixed(2)
  };
}

/** The quick preference chips of the screen. */
export const QUICK = [
  { id: 'oneBl', label: 'One BL' },
  { id: 'fewest', label: 'At most 2 BLs' },
  { id: 'older', label: 'Oldest trade flows first' },
  { id: 'fewTfs', label: 'Fewest trade flows' }
] as const;

/** The chips as rules the app applies itself (no AI needed). */
export function quickRules(ids: string[]): Rules {
  const rules: Rules = {};
  if (ids.includes('fewest')) rules.maxBls = 2;
  if (ids.includes('oneBl')) rules.maxBls = 1;
  if (ids.includes('older')) rules.preferOlder = true;
  if (ids.includes('fewTfs')) rules.preferFewerTfs = true;
  return rules;
}

/**
 * Proposals in order. Those that complete the amount always come before partial fills; then the typed order preferences;
 * then the fill options in the order they were chosen (fewest BLs, closest to the amount, oldest trade flows); then the
 * closest. Among partial fills the fullest is best.
 */
type Way = 'fewest' | 'closest' | 'oldest' | 'contracts' | 'parties';
export function orderByRules<C extends { bls: string[]; diffPct: number; tfs: number; cap?: unknown; fit?: 'under' | 'over'; kinds?: string[]; alt?: number }>(list: C[], rules: Rules,
  bls: Map<string, { tfDate?: string; tfNo?: string; blDate?: string; contractRef?: string; notifyParty?: string }>,
  fills: readonly Way[] = ['closest']): C[] {
  // A proposal's age: its newest BL (all-old proposals first), then its oldest; BL date (else TF date), then TF number.
  const ages = (c: C) => c.bls.map(no => `${str(bls.get(no)?.blDate) || str(bls.get(no)?.tfDate)}|${str(bls.get(no)?.tfNo).padStart(12, '0')}`).sort();
  const age = (c: C) => { const a = ages(c); return `${a[a.length - 1] ?? ''}#${a[0] ?? ''}`; };
  // A capped proposal fills the deal exactly.
  const off = (c: C) => (c.cap ? 0 : Math.abs(c.diffPct));
  const groups = (c: C, f: 'contractRef' | 'notifyParty') => new Set(c.bls.map(no => str(bls.get(no)?.[f]))).size;
  const by: Record<Way, (a: C, b: C) => number> = {
    fewest: (a, b) => (a.fit !== 'under' && b.fit !== 'under' ? a.bls.length - b.bls.length : 0),
    closest: (a, b) => off(a) - off(b),
    oldest: (a, b) => age(a).localeCompare(age(b)),
    contracts: (a, b) => groups(a, 'contractRef') - groups(b, 'contractRef'),
    parties: (a, b) => groups(a, 'notifyParty') - groups(b, 'notifyParty')
  };
  // With several ways chosen, their proposals take turns in the order the ways were chosen: each way's best, then each
  // way's second, and so on (so every way shows, and the order never jumps when an option is turned on or off).
  if (fills.length > 1 && !rules.preferOlder && !rules.preferNewer && !rules.preferFewerTfs && list.some(c => c.kinds?.length)) {
    const per = fills.map(f => list.filter(c => c.kinds?.[0] === f).sort((a, b) => (a.alt ?? 0) - (b.alt ?? 0)));
    const out: C[] = [];
    for (let i = 0; per.some(p => p[i]); i++) for (const p of per) if (p[i]) out.push(p[i]);
    return renumber([...out, ...list.filter(c => !out.includes(c))]);
  }
  return renumber([...list].sort((a, b) => {
    let d = Number(a.fit === 'under') - Number(b.fit === 'under')
      || (rules.preferOlder ? age(a).localeCompare(age(b)) : 0)
      || (rules.preferNewer ? age(b).localeCompare(age(a)) : 0)
      || (rules.preferFewerTfs ? a.tfs - b.tfs : 0);
    for (const f of fills) d ||= by[f](a, b);
    return d || off(a) - off(b) || a.bls.length - b.bls.length;
  }));
}

/** The alternatives of each way numbered in the order shown (its first shown is its best, then alt. 2, 3, …). */
function renumber<C extends { kinds?: string[]; alt?: number }>(list: C[]): C[] {
  const seen = new Map<string, number>();
  return list.map(c => {
    const way = c.kinds?.[0];
    if (!way) return c;
    const n = (seen.get(way) ?? 0) + 1;
    seen.set(way, n);
    return { ...c, alt: n };
  });
}

/** How much of a deal has BLs: Unassigned, Partially assigned, Fully assigned (within 1%), or no USD rate. */
export type AssignState = 'Unassigned' | 'Partially assigned' | 'Fully assigned' | 'No USD rate';
export const assignState = (d: { status: string; assignedUsd: string }): AssignState =>
  d.status === 'No USD rate' ? 'No USD rate' : d.status === 'Filled' ? 'Fully assigned' : Number(d.assignedUsd || 0) > 0 ? 'Partially assigned' : 'Unassigned';
export const STATE_TONE: Record<AssignState, 'green' | 'amber' | 'red'> = { Unassigned: 'red', 'Partially assigned': 'amber', 'Fully assigned': 'green', 'No USD rate': 'red' };
