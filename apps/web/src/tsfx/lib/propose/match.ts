// Propose Tradeflows: the arithmetic of matching BLs to a Deal ID (design 2026-11-05-manage-propose-tradeflows).
// Every amount is USD and exact (integer cents). The AI only ranks what this finds and turns preferences into Rules;
// it never makes up numbers. Pure: shared by the page and the tests.
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

/** What the person's preferences may say, as the AI returns them (anything else is "not understood"). */
export interface Rules {
  maxBls?: number;
  minBls?: number;
  /** Only BLs of these trade flows. */
  includeTf?: string[];
  excludeTf?: string[];
  /** These BLs must be in every combination. */
  includeBl?: string[];
  excludeBl?: string[];
  preferOlder?: boolean;
  preferNewer?: boolean;
  preferFewerTfs?: boolean;
  /** Tighter than the standard 1%, never wider. */
  tolerancePct?: number;
}
export interface Combination {
  bls: string[]; totalUsd: string; diffPct: number; tfs: number;
  /** Only on a closest proposal (nothing came within the tolerance): it stays under the amount, or goes over it. */
  fit?: 'under' | 'over';
  /** On an 'over' proposal: the BL that tips it over is assigned only the USD still left, so the deal ends filled. */
  cap?: { blNo: string; usd: string };
  /** The ways of filling that found this set (fewest BLs, closest, oldest, fewest contracts, fewest notify parties). */
  kinds?: string[];
  /** Its place among the proposals of its first way (1 = that way's best). */
  alt?: number;
}

export const TOLERANCE_PCT = 1;
/** BLs in one proposal: a large Deal ID can need well over a hundred. */
/** The most BLs one proposal may hold: a deal typically needs 300-500 BLs (2026-11-07). */
export const MAX_BLS = 600;
export const MAX_RESULTS = 50;
/** Search steps before giving up on finding more (keeps hundreds of BLs well under a second). */
const BUDGET = 400000;

const cents = (v: string): bigint | null => {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str(v));
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(2, '0');
  const whole = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2));
  const round = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;
  return (whole + round) * (m[1] ? -1n : 1n);
};
const money = (c: bigint): string => {
  const neg = c < 0n, a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
const pct = (diff: bigint, target: bigint): number => (target === 0n ? 0 : Math.round(Number((diff * 1000000n) / target)) / 10000);

/** The amount in USD with the rate type M rate (`rates[currency]` = USD per unit); null when there is no rate. */
export function toUsd(amount: string, currency: string, rates: Record<string, string>): string | null {
  const a = str(amount);
  if (!/^-?\d+(\.\d+)?$/.test(a)) return null;
  const cur = str(currency).toUpperCase();
  if (cur === 'USD' || cur === '') return money(cents(a) ?? 0n);
  const rate = str(rates[cur]);
  if (!/^\d+(\.\d+)?$/.test(rate)) return null;
  // amount × rate, both decimal strings, rounded half up to cents.
  const [ai, af = ''] = a.replace('-', '').split('.'), [ri, rf = ''] = rate.split('.');
  const product = BigInt(ai + af) * BigInt(ri + rf);
  const scale = af.length + rf.length;
  const unit = scale >= 2 ? 10n ** BigInt(scale - 2) : 1n;
  const c = scale >= 2 ? (product + unit / 2n) / unit : product * 10n ** BigInt(2 - scale);
  return money(a.startsWith('-') ? -c : c);
}

/** BLs that may go to a Deal ID: active, unassigned, priced, of a commodity mapped to its TSF FX commodity. */
export function candidates(bls: Row[], tsfCommodity: string, commodities: Row[], rules: Rules): Row[] {
  const mine = new Set(commodities.filter(c => str(c.tsfCommodity) && str(c.tsfCommodity) === str(tsfCommodity)).map(c => str(c.commodity)));
  return bls.filter(b => str(b.deletedFlag) !== 'X' && !str(b.dealId) && cents(b.usdValue) !== null && (cents(b.usdValue) ?? 0n) > 0n
    && mine.has(str(b.commodity))
    && !(rules.excludeBl ?? []).includes(str(b.blNo)) && !(rules.excludeTf ?? []).includes(str(b.tfNo))
    && (!rules.includeTf?.length || rules.includeTf.includes(str(b.tfNo))));
}

/** Sets of BLs whose USD total is within the tolerance of the target: exact, bounded (≤ MAX_RESULTS, ≤ maxBls each). */
export function findCombinations(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const tolPct = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const tol = (target * BigInt(Math.round(tolPct * 10000))) / 1000000n;
  const lo = target - tol, hi = target + tol;
  const maxBls = Math.max(1, Math.min(MAX_BLS, rules.maxBls ?? MAX_BLS)), minBls = Math.max(1, rules.minBls ?? 1);
  const items = cands.map(b => ({ row: b, v: cents(b.usdValue) ?? 0n })).filter(i => i.v > 0n).sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : 0));
  const required = items.filter(i => (rules.includeBl ?? []).includes(str(i.row.blNo)));
  const pool = items.filter(i => !required.includes(i));
  // suffix[i]: the sum of the largest `k` values from i on is at most suffix sum; used to cut hopeless branches.
  const suffix: bigint[] = new Array(pool.length + 1).fill(0n);
  for (let i = pool.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + pool[i].v;
  // top(i, r): the r largest values from i on (the pool is sorted largest first).
  const prefix: bigint[] = [0n];
  for (const p of pool) prefix.push(prefix[prefix.length - 1] + p.v);
  const top = (i: number, r: number) => prefix[Math.min(pool.length, i + r)] - prefix[i];
  const out: Combination[] = [];
  let steps = 0;
  const chosen: typeof pool = [];
  const emit = (sum: bigint, set: typeof pool) => {
    const rows = set.map(s => s.row);
    out.push({ bls: rows.map(r => str(r.blNo)), totalUsd: money(sum), diffPct: pct(sum - target, target), tfs: new Set(rows.map(r => str(r.tfNo))).size });
  };
  const base = required.reduce((s, r) => s + r.v, 0n);
  const walk = (start: number, sum: bigint) => {
    if (out.length >= MAX_RESULTS || ++steps > BUDGET) return;
    const count = required.length + chosen.length;
    if (sum >= lo && sum <= hi && count >= minBls) emit(sum, [...required, ...chosen]);
    if (count >= maxBls) return;
    for (let i = start; i < pool.length; i++) {
      if (out.length >= MAX_RESULTS || steps > BUDGET) return;
      const next = sum + pool[i].v;
      if (next > hi) continue;                  // too big; smaller ones follow
      if (sum + suffix[i] < lo) return;          // even everything left is too little
      if (sum + top(i, maxBls - count) < lo) return;   // even the largest that still fit are too little
      chosen.push(pool[i]);
      walk(i + 1, next);
      chosen.pop();
    }
  };
  if (required.length <= maxBls && base <= hi) walk(0, base);
  return out;
}

/** The fewest BLs a set needs to reach `lo`: the largest ones first. */
function fewestNeeded(cands: Row[], lo: bigint): number {
  const values = cands.map(b => cents(b.usdValue) ?? 0n).filter(v => v > 0n).sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  let sum = 0n;
  for (let k = 0; k < values.length; k++) { sum += values[k]; if (sum >= lo) return k + 1; }
  return values.length + 1;
}

/**
 * The combinations within the tolerance that use the fewest BLs, the bigger BLs first: tries sets of the smallest
 * possible size, then one BL more, a few times; then any size. Closest first within the same size.
 */
export function findFewest(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const tolPct = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const lo = target - (target * BigInt(Math.round(tolPct * 10000))) / 1000000n;
  const maxBls = Math.max(1, Math.min(MAX_BLS, rules.maxBls ?? MAX_BLS));
  const first = Math.max(1, rules.minBls ?? 1, fewestNeeded(cands, lo));
  const byFit = (list: Combination[]) => [...list].sort((a, b) => a.bls.length - b.bls.length || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  for (let k = first; k <= Math.min(maxBls, first + 5); k++) {
    const found = findTight(cands, targetUsd, { ...rules, maxBls: k });
    if (found.length) return byFit(found);
  }
  return first + 5 < maxBls ? byFit(findTight(cands, targetUsd, rules)) : [];
}

/** Tolerances searched from the tightest: exact or near-exact combinations are found before those near the 1% edge. */
const TIGHTENING = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1];

/**
 * findCombinations, searched again at ever tighter tolerances and merged, closest first. A search that takes the largest
 * BLs first stops after MAX_RESULTS finds near the edge of the tolerance; searching the narrow windows first finds the
 * combinations that come closest to the amount.
 */
export function findTight(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const limit = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const seen = new Set<string>();
  const out: Combination[] = [];
  const amounts = new Set<string>();
  for (const t of TIGHTENING.filter(x => x <= limit).concat(TIGHTENING.includes(limit) ? [] : [limit])) {
    for (const c of findCombinations(cands, targetUsd, { ...rules, tolerancePct: t })) {
      const key = [...c.bls].sort().join('+');
      if (!seen.has(key)) { seen.add(key); out.push(c); amounts.add(`${c.totalUsd}|${c.bls.length}`); }
    }
    // Enough different amounts to choose from (many BLs share a value, so many sets look the same).
    if (amounts.size >= DISTINCT_WANTED) break;
  }
  out.sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length);
  // One set per amount first, then the rest: the list keeps its variety within MAX_RESULTS.
  const firsts: Combination[] = [], rest: Combination[] = [], taken = new Set<string>();
  for (const c of out) { const k = `${c.totalUsd}|${c.bls.length}`; (taken.has(k) ? rest : firsts).push(c); taken.add(k); }
  return [...firsts, ...rest].slice(0, MAX_RESULTS).sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length);
}
const DISTINCT_WANTED = 8;

/**
 * A BL's age for "oldest first": its BL date (else its trade flow date), then its trade flow number (SAP numbers trade
 * flows in the order they were created).
 */
export const blAge = (b: Row): string => `${str(b.blDate) || str(b.tfDate)}|${str(b.tfNo).padStart(12, '0')}`;

/**
 * The combinations within the tolerance that keep to the fewest groups of a field (contracts, notify parties): the
 * groups with the most value first, added one by one until a combination is found. BLs a rule requires are always in.
 */
export function findFewestGroups(cands: Row[], targetUsd: string, rules: Rules, field: string): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const tolPct = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const lo = target - (target * BigInt(Math.round(tolPct * 10000))) / 1000000n;
  const value = (rows: Row[]) => rows.reduce((s, b) => s + (cents(b.usdValue) ?? 0n), 0n);
  const groups = new Map<string, Row[]>();
  for (const b of cands) { const k = str(b[field]) || '—'; groups.set(k, [...(groups.get(k) ?? []), b]); }
  const order = [...groups.values()].sort((a, b) => { const d = value(b) - value(a); return d > 0n ? 1 : d < 0n ? -1 : 0; });
  const must = new Set(rules.includeBl ?? []);
  let pool = cands.filter(b => must.has(str(b.blNo)));
  for (const g of order) {
    pool = [...pool, ...g.filter(b => !must.has(str(b.blNo)))];
    if (value(pool) < lo) continue;
    const found = findTight(pool, targetUsd, rules);
    if (found.length) return found;
  }
  return [];
}

/**
 * The combinations within the tolerance made of the oldest free BLs: the smallest group of oldest BLs that can still
 * make the amount, widened step by step until a combination is found, then searched closest first.
 */
export function findOldest(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const tolPct = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const lo = target - (target * BigInt(Math.round(tolPct * 10000))) / 1000000n;
  const byAge = [...cands].sort((a, b) => blAge(a).localeCompare(blAge(b)));
  let sum = 0n, need = byAge.length;
  for (let i = 0; i < byAge.length; i++) { sum += cents(byAge[i].usdValue) ?? 0n; if (sum >= lo) { need = i + 1; break; } }
  if (sum < lo) return [];
  // Widen until a combination is found, then up to two steps more (or until there are several amounts) so there is a
  // choice; the oldest-made sets come first (newest BL, then the closest).
  const seen = new Set<string>(), out: Combination[] = [];
  let extra = -1;
  for (let size = need; ; size = Math.ceil(size * 1.5) + 1) {
    const n = Math.min(size, byAge.length);
    for (const c of findTight(byAge.slice(0, n), targetUsd, rules)) {
      const k = [...c.bls].sort().join('+');
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
    if (out.length && extra < 0) extra = 0;
    if (extra >= 0 && (++extra > 2 || new Set(out.map(c => `${c.totalUsd}|${c.bls.length}`)).size >= OLDEST_WANTED)) break;
    if (n >= byAge.length) break;
  }
  const rank = new Map(byAge.map((b, i) => [str(b.blNo), i]));
  const newestOf = (c: Combination) => Math.max(...c.bls.map(no => rank.get(no) ?? 0));
  return out.sort((a, b) => newestOf(a) - newestOf(b) || Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length).slice(0, MAX_RESULTS);
}
const OLDEST_WANTED = 4;

export const CLOSEST_EACH = 3;

/**
 * When no combination comes within the tolerance: the closest ones instead (exact, bounded like findCombinations).
 * 'under': the fullest sets that stay below the amount (they fill part of it). 'over': the smallest sets that cover it,
 * each minimal (without its smallest BL it would fall short); that BL is capped at the USD still left, so accepting it
 * fills the deal exactly. Sets with the same values are shown once.
 */
export function closestCombinations(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const maxBls = Math.max(1, Math.min(MAX_BLS, rules.maxBls ?? MAX_BLS)), minBls = Math.max(1, rules.minBls ?? 1);
  const items = cands.map(b => ({ row: b, v: cents(b.usdValue) ?? 0n })).filter(i => i.v > 0n).sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : 0));
  const required = items.filter(i => (rules.includeBl ?? []).includes(str(i.row.blNo)));
  const pool = items.filter(i => !required.includes(i));
  if (required.length > maxBls) return [];
  type Set_ = { set: typeof items; sum: bigint };
  const under = new Map<string, Set_>(), over = new Map<string, Set_>();
  const sig = (set: typeof items) => set.map(s => String(s.v)).join(',');
  // Keeps the best CLOSEST_EACH distinct value sets: the largest sums under, the smallest sums over.
  const worstOf = (into: Map<string, Set_>, better: (a: bigint, b: bigint) => boolean): bigint | null =>
    (into.size < CLOSEST_EACH ? null : [...into.values()].reduce((w, e) => (better(w.sum, e.sum) ? e : w)).sum);
  /** Whether a sum could still enter the kept sets (checked before building the set, so deep searches stay cheap). */
  const worth = (into: Map<string, Set_>, sum: bigint, better: (a: bigint, b: bigint) => boolean) => {
    const worst = worstOf(into, better);
    return worst === null || better(sum, worst);
  };
  const keep = (into: Map<string, Set_>, set: typeof items, sum: bigint, better: (a: bigint, b: bigint) => boolean) => {
    if (!worth(into, sum, better)) return;
    const key = sig(set);
    if (into.has(key)) return;
    if (into.size >= CLOSEST_EACH) {
      const worst = [...into.entries()].reduce((w, e) => (better(w[1].sum, e[1].sum) ? e : w));
      if (!better(sum, worst[1].sum)) return;
      into.delete(worst[0]);
    }
    into.set(key, { set: [...set], sum });
  };
  const bigger = (a: bigint, b: bigint) => a > b, smaller = (a: bigint, b: bigint) => a < b;
  const base = required.reduce((s, r) => s + r.v, 0n);
  if (base >= target) {
    // The BLs that must be in it already reach the amount.
    if (required.length >= minBls) keep(over, required, base, smaller);
  } else {
    let steps = 0;
    const chosen: typeof pool = [];
    const suffix: bigint[] = new Array(pool.length + 1).fill(0n);
    for (let i = pool.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + pool[i].v;
    const walk = (start: number, sum: bigint) => {
      if (++steps > BUDGET) return;
      const count = required.length + chosen.length;
      if (count >= minBls && count > 0 && worth(under, sum, bigger)) keep(under, [...required, ...chosen], sum, bigger);
      if (count >= maxBls) return;
      // Everything left cannot reach the amount nor beat the partial fills already kept.
      const reach = sum + suffix[start];
      if (reach < target && !worth(under, reach, bigger)) return;
      for (let i = start; i < pool.length && steps <= BUDGET; i++) {
        if (i > start && pool[i].v === pool[i - 1].v) continue;   // the same value again: the same sums
        const next = sum + pool[i].v;
        if (next >= target) {
          // Crosses the amount; adding anything smaller after it is never minimal.
          if (count + 1 >= minBls && worth(over, next, smaller)) keep(over, [...required, ...chosen, pool[i]], next, smaller);
          continue;
        }
        chosen.push(pool[i]);
        walk(i + 1, next);
        chosen.pop();
      }
    };
    walk(0, base);
  }
  const tfsOf = (set: typeof items) => new Set(set.map(s => str(s.row.tfNo))).size;
  const out: Combination[] = [];
  for (const { set, sum } of [...over.values()].sort((a, b) => (a.sum < b.sum ? -1 : 1))) {
    // The last BL added is the smallest: it takes only what is left after the others.
    const last = set[set.length - 1], capped = last.v - (sum - target);
    out.push({ bls: set.map(s => str(s.row.blNo)), totalUsd: money(sum), diffPct: pct(sum - target, target), tfs: tfsOf(set),
      fit: 'over', cap: sum === target || capped <= 0n ? undefined : { blNo: str(last.row.blNo), usd: money(capped) } });
  }
  for (const { set, sum } of [...under.values()].sort((a, b) => (a.sum > b.sum ? -1 : 1))) {
    out.push({ bls: set.map(s => str(s.row.blNo)), totalUsd: money(sum), diffPct: pct(sum - target, target), tfs: tfsOf(set), fit: 'under' });
  }
  return out;
}

/** The USD a proposal assigns to the deal: its total, or the amount left when its last BL is capped. */
export function assignedTotal(c: Combination, targetUsd: string): string {
  // With a cap the BLs give exactly what is left (the capped BL takes the total minus the excess).
  return c.cap ? money(cents(targetUsd) ?? 0n) : c.totalUsd;
}

/** The fallback order without the AI: closest to the target first, then fewer BLs, then fewer trade flows. */
export function rankByCloseness(list: Combination[]): Combination[] {
  return [...list].sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length || a.tfs - b.tfs);
}

/** The Deal ID's USD amount minus what its active BLs were assigned with (AssignedUsd). */
export function remaining(dealUsd: string, assigned: Row[]): string {
  const total = assigned.filter(b => str(b.deletedFlag) !== 'X').reduce((s, b) => s + (cents(b.assignedUsd) ?? 0n), 0n);
  return money((cents(dealUsd) ?? 0n) - total);
}
