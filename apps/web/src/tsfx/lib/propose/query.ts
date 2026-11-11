// Propose Tradeflows: typed conditions → structured criteria, and the criteria applied to the real deals and BLs (pure,
// tested). The text is read deterministically here; the AI (BackEnd /api/ai/interpret) is asked only for what this reader
// could not place, and its answer is validated into the same Criteria. Criteria only ever filter real SAP rows: they never
// create a deal, a BL or an amount.
//
// Amounts: "> 50K" is strictly above 50000; "50K+" is 50000 or more. Units: K = 1,000, L / lakh = 1,00,000,
// M / mn = 1,000,000, Cr / crore = 10,000,000. A deal condition never becomes a BL condition: an amount condition must
// name its subject (deal, BL, left / remaining, quantity), or it is reported as not applied.
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';

export type Op = '>' | '>=' | '<' | '<=' | '=' | 'between';
export interface Cmp { op: Op; value: number; to?: number }
export interface DateRange { from?: string; to?: string; fromStrict?: boolean; toStrict?: boolean }

export type TextField = 'contractRef' | 'notifyParty' | 'invoiceRef' | 'blNumber';
export type DateField = 'tfDate' | 'blDate' | 'etd' | 'eta';
export interface TextCondition { field: TextField; mode: 'only' | 'exclude'; values: string[] }
export interface BlRange { from: string; to: string; mode: 'only' | 'exclude' }
/** "top 10 largest BLs": the N first BLs of the deal's free BLs in an order; resolved into BL numbers (resolveTop). */
export interface TopPick { n: number; by: 'usdValue' | 'quantity' | 'blDate'; desc: boolean; mode: 'include' | 'only' | 'exclude' }

export interface Criteria {
  /** 'all': the deal conditions filter the Deal ID list; 'selected': they are checked on the chosen deal only. */
  scope: 'selected' | 'all';
  deal: { amount?: Cmp; remaining?: Cmp; dealIds?: string[] };
  bl: {
    amount?: Cmp; quantity?: Cmp; tfDate?: DateRange;
    /** Only these BLs may be used. */ only?: string[];
    /** These BLs must be in every proposal. */ include?: string[];
    exclude?: string[]; onlyTf?: string[]; excludeTf?: string[];
    /** BL date, ETD and ETA ranges (the trade flow date is tfDate). */ blDate?: DateRange; etd?: DateRange; eta?: DateRange;
    /** BL number ranges, inclusive. */ ranges?: BlRange[];
    /** Contract, notify party, invoice or BL reference: only / not these ("*" stands for any characters). */ text?: TextCondition[];
    /** The N largest / smallest / oldest / newest BLs, until resolveTop turns them into BL numbers. */ top?: TopPick[];
  };
  /** Fill only part of what is left: a share (%) or a USD amount. */
  target?: { pct?: number; usd?: number };
  /** Commodity codes or names as typed; matched against the commodity master (and the deal's TSF FX commodity). */
  commodity?: string[];
  maxBls?: number; minBls?: number;
  order?: { older?: boolean; newer?: boolean; fewerTfs?: boolean };
  /** Ways of filling named in the text ("fewest BLs", "closest amount"): they set the Fill with choice. */
  ways?: ('fewest' | 'closest' | 'oldest')[];
}

export interface Reading { criteria: Criteria; applied: string[]; notUnderstood: string[] }

export const emptyCriteria = (): Criteria => ({ scope: 'selected', deal: {}, bl: {} });

const UNITS: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 };
const UNIT_RE = 'k|thousand|lacs?|lakhs?|l|mn|million|m|crores?|cr';
const NUM = `(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?\\b`;
const toNumber = (n: string, unit?: string) => Number(n.replace(/,/g, '')) * (unit ? UNITS[unit.toLowerCase()] ?? 1 : 1);
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

const OPS: [RegExp, Op][] = [
  [/(?:greater than or equal to|at least|minimum of|minimum|min\.?|not less than|no less than|>=|≥)\s*$/i, '>='],
  [/(?:less than or equal to|at most|up to|upto|maximum of|maximum|max\.?|not more than|no more than|<=|≤)\s*$/i, '<='],
  [/(?:greater than|more than|above|over|exceeding|exceeds|higher than|>)\s*$/i, '>'],
  [/(?:less than|below|under|lower than|<)\s*$/i, '<'],
  [/(?:equal to|equals|exactly|of exactly|=)\s*$/i, '=']
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** A typed date as YYYY-MM-DD (06-11-2026, 06/11/2026, 2026-11-06, 6 Nov 2026, Nov 6 2026), or ''. */
export function readDate(text: string): string {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[2])) return `${m[3]}-${pad(MONTHS.indexOf(m[2]) + 1)}-${pad(+m[1])}`;
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[1])) return `${m[3]}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(+m[2])}`;
  return '';
}
const DATE = `(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}\\s+[a-z]{3,9}\\.?,?\\s+\\d{4}|[a-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4})`;

/** A 10-digit number by its number range: BL 40…, trade flow 30…, Deal ID 70…; else by the word before it. */
function kindOf(num: string, before: string): 'bl' | 'tf' | 'deal' | '' {
  const near = before.slice(-24).toLowerCase();
  if (/\b(?:trade\s*flows?|tfs?)\b[\s:#no.]*$/.test(near)) return 'tf';
  if (/\b(?:bls?|bill(?:s)? of lading)\b[\s:#no.]*$/.test(near)) return 'bl';
  if (/\bdeals?(?:\s*ids?)?\b[\s:#no.]*$/.test(near)) return 'deal';
  return num.startsWith('4') ? 'bl' : num.startsWith('3') ? 'tf' : num.startsWith('7') ? 'deal' : '';
}

const VERB_RE = /\b(exclude|excluding|without|except|not|no|remove|skip|avoid|leave out|keep out|other than|don't|dont|do not|never|drop|ignore|minus|apart from|only|just|include|including|must include|must use|always|use|with|plus)\b/g;
/** What the last verb before a list asks: exclude, only, include, or '' (none). */
function modeOf(before: string): 'exclude' | 'only' | 'include' | '' {
  const verb = [...before.toLowerCase().matchAll(VERB_RE)].at(-1)?.[1] ?? '';
  return /exclude|excluding|without|except|^not$|^no$|remove|skip|avoid|leave out|keep out|other than|don't|dont|do not|never|drop|ignore|minus|apart from/.test(verb) ? 'exclude' : /only|just/.test(verb) ? 'only' : verb ? 'include' : '';
}
const TEXT_LABEL: Record<TextField, string> = { contractRef: 'contract', notifyParty: 'notify party', invoiceRef: 'invoice', blNumber: 'BL reference' };
const DATE_FIELDS: DateField[] = ['tfDate', 'blDate', 'etd', 'eta'];
const DATE_LABEL: Record<DateField, string> = { tfDate: 'trade flow dated', blDate: 'BL dated', etd: 'ETD', eta: 'ETA' };
const ddmmyyyy = (s?: string) => (s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '');
function dateLabel(f: DateField, r: DateRange): string {
  const n = DATE_LABEL[f], d = ddmmyyyy;
  return r.from && r.to && r.from === r.to ? `${n} ${d(r.from)}` : r.from && r.to ? `${n} ${d(r.from)} – ${d(r.to)}`
    : r.from ? `${n} ${r.fromStrict ? 'after' : 'from'} ${d(r.from)}` : `${n} ${r.toStrict ? 'before' : 'up to'} ${d(r.to)}`;
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const STOP = new Set(['quantity', 'qty', 'weight', 'weighing', 'lbs', 'lb', 'kg', 'kgs', 'mt', 'mts', 'tonnes', 'tons', 'worth', 'valued', 'priced', 'price', 'prefer', 'preferably', 'ideally', 'try', 'just', 'also', 'then', 'now', 'let', 'lets', 'make', 'sure', 'like', 'some', 'more', 'less', 'around', 'about', 'approximately', 'roughly', 'total', 'big', 'small', 'large', 'larger', 'smaller', 'bigger', 'over', 'under', 'above', 'below', 'my', 'our', 'their', 'this', 'there', 'here', 'pick', 'choose', 'select', 'take', 'put', 'add', 'set', 'go', 'see', 'look', 'way', 'ways', 'first', 'last', 'order', 'sort', 'sorted', 'show', 'me', 'the', 'a', 'an', 'and', 'or', 'with', 'of', 'for', 'to', 'in', 'on', 'only', 'please', 'proposal', 'proposals', 'propose', 'deal', 'deals', 'bl', 'bls', 'that', 'which', 'whose', 'is', 'are', 'amount', 'value', 'usd', 'all', 'from', 'by', 'it', 'them', 'those', 'these', 'find', 'list', 'give', 'get', 'any', 'have', 'has', 'where', 'than', 'trade', 'flow', 'flows', 'tf', 'tfs', 'number', 'numbers', 'no', 'not', 'but', 'use', 'using', 'keep', 'out', 'first', 'between', 'within', 'across', 'every', 'dated', 'date', 'dates', 'left', 'remaining', 'bill', 'lading', 'party', 'notify', 'contract', 'invoice', 'ref', 'reference', 'shipped', 'arriving', 'percent', 'fill', 'assign', 'up', 'eta', 'etd', 'shipment', 'shipments', 'dont', 'don', 't', 'do', 'never', 'drop', 'ignore', 'minus', 'apart', 'than', 'older', 'newer', 'days', 'day', 'last', 'past', 'want', 'need', 'i', 'we', 'can', 'you', 'should', 'be', 'used', 'those', 'one', 'ones', 'out', 'excluded', 'removed']);

/** What the reader may know beyond the text: the values the deal's BLs carry (so a name alone is understood), and today. */
export interface ReadOptions { known?: Partial<Record<TextField, string[]>>; today?: string }

const TOP_WORD: Record<TopPick['by'], [string, string]> = { usdValue: ['largest', 'smallest'], quantity: ['heaviest', 'lightest'], blDate: ['newest', 'oldest'] };
const TOP_MODE: Record<TopPick['mode'], string> = { include: 'must include', only: 'only', exclude: 'exclude' };
/** "must include the 10 largest BLs (by value)". */
export const topLabel = (t: TopPick) => `${TOP_MODE[t.mode]} the ${t.n} ${TOP_WORD[t.by][t.desc ? 0 : 1]} BL${t.n > 1 ? 's' : ''}${t.by === 'usdValue' ? ' by value' : t.by === 'quantity' ? ' by quantity' : ' by BL date'}`;

/**
 * "top N" conditions turned into BL numbers of the given pool (the deal's free BLs): include / only / exclude lists the
 * matcher knows. Returns the criteria without `top`, and one line per condition saying which BLs it took.
 */
export function resolveTop(c: Criteria, pool: Row[]): { criteria: Criteria; picked: string[] } {
  if (!c.bl.top?.length) return { criteria: c, picked: [] };
  const bl = { ...c.bl };
  const picked: string[] = [];
  for (const t of c.bl.top) {
    const key = (b: Row) => (t.by === 'blDate' ? str(b.blDate) || str(b.tfDate) : Number(str(b[t.by]) || 0));
    const nos = [...pool].sort((a, b) => {
      const x = key(a), y = key(b);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return (t.desc ? -d : d) || str(a.blNo).localeCompare(str(b.blNo));
    }).slice(0, t.n).map(b => str(b.blNo));
    if (!nos.length) continue;
    const slot = t.mode === 'include' ? 'include' : t.mode;
    bl[slot] = [...new Set([...(bl[slot] ?? []), ...nos])];
    picked.push(`${topLabel(t)}: ${nos.length < t.n ? `only ${nos.length} free, ` : ''}BL ${nos.join(', ')}`);
  }
  delete bl.top;
  return { criteria: { ...c, bl }, picked };
}

/** Reads typed conditions. `commodities` is the commodity master (commodity, description, tsfCommodity). */
export function readConditions(text: string, commodities: Row[] = [], opts: ReadOptions = {}): Reading {
  const c = emptyCriteria();
  const applied: string[] = [];
  const notUnderstood: string[] = [];
  // "don't use" / "do not take" / "never include" mean exclude.
  // Number words become digits ("top ten" → "top 10"); "half of the deal" → "fill 50%".
  const words = text.replace(/\s+/g, ' ').trim()
    .replace(/\b(?:don'?t|do not|never)\s+(?:use|take|include|want|pick)\b/gi, 'exclude')
    .replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/gi, w => String(NUMBER_WORDS[w.toLowerCase()]))
    .replace(/\b(?:fill\s+|assign\s+|propose\s+)?(?:a\s+|the\s+)?(half|quarter|third)\s+(?:of\s+)?(?:the\s+)?(?:deal|amount|remaining|what is left)?\b/gi, (_m, w: string) => ` fill ${({ half: 50, quarter: 25, third: 33.33 } as Record<string, number>)[w.toLowerCase()]}% `);
  let rest = ` ${words} `;
  const lower = () => rest.toLowerCase();
  let said = rest;
  const cut = (start: number, end: number) => { rest = `${rest.slice(0, start)} ${' '.repeat(Math.max(0, end - start - 1))}${rest.slice(end)}`; };
  if (!text.trim()) return { criteria: c, applied, notUnderstood };

  // 1. Scope: an explicit search across deals.
  if (/\b(?:show|list|find|which|search|all|across|any|other)\b[^.]*\bdeals\b|\bdeals\s+(?:with|where|whose|above|over|below|under|greater|less|more)/i.test(rest)) {
    c.scope = 'all';
    applied.push('across all deals');
  }

  // 1b. BL number ranges: "exclude BLs 4000001000 to 4000001100", "only BLs between 4000001000 and 4000002000".
  for (const re of [/\bbetween\s+(\d{10})\s+(?:and|to|-)\s+(\d{10})\b/gi, /\b(\d{10})\s*(?:-|–|to|till|until|through|thru)\s*(\d{10})\b/gi]) {
    for (const m of [...rest.matchAll(re)]) {
      const at = m.index ?? 0, before = rest.slice(0, at);
      if (kindOf(m[1], before) !== 'bl' || kindOf(m[2], '') !== 'bl') continue;
      const [from, to] = [m[1], m[2]].sort();
      const mode = modeOf(before.slice(-32)) === 'exclude' ? 'exclude' : 'only';
      (c.bl.ranges ??= []).push({ from, to, mode });
      applied.push(`${mode} BLs ${from} – ${to}`);
      cut(at, at + m[0].length);
    }
  }

  // 1d. "top 10 largest BLs", "the 20 oldest BLs", "smallest 5 BLs by quantity", "exclude the 10 biggest BLs".
  const topRes = [
    /\b(?:the\s+)?(?:top|first)\s+(\d{1,3})\s+(?:(largest|biggest|highest|heaviest|smallest|lowest|lightest|oldest|newest|latest|earliest|recent)\s+)?(?:bls?|bills? of lading)\b(?:\s+(?:by|on)\s+(value|usd|amount|quantity|qty|weight|date|age))?/gi,
    /\b(?:the\s+)?(\d{1,3})\s+(largest|biggest|highest|heaviest|smallest|lowest|lightest|oldest|newest|latest|earliest|recent)\s+(?:bls?|bills? of lading)\b(?:\s+(?:by|on)\s+(value|usd|amount|quantity|qty|weight|date|age))?/gi,
    /\b(?:the\s+)?(largest|biggest|highest|heaviest|smallest|lowest|lightest|oldest|newest|latest|earliest|recent)\s+(\d{1,3})\s+(?:bls?|bills? of lading)\b(?:\s+(?:by|on)\s+(value|usd|amount|quantity|qty|weight|date|age))?/gi,
    // "bottom 10 BLs" / "last 10 BLs": the smallest (the end of a largest-first list).
    /\b(?:the\s+)?(?:bottom|last)\s+(\d{1,3})\s+(?:bls?|bills? of lading)\b(?:\s+(?:by|on)\s+(value|usd|amount|quantity|qty|weight|date|age))?/gi
  ];
  topRes.forEach((re, k) => {
    for (const m of [...rest.matchAll(re)]) {
      const n = Number(k === 2 ? m[2] : m[1]);
      const word = (k === 3 ? 'smallest' : (k === 2 ? m[1] : m[2]) ?? '').toLowerCase(), byWord = ((k === 3 ? m[2] : m[3]) ?? '').toLowerCase();
      if (!(n > 0)) continue;
      const by: TopPick['by'] = /quantity|qty|weight/.test(byWord) || /heaviest|lightest/.test(word) ? 'quantity' : /date|age/.test(byWord) || /oldest|newest|latest|earliest|recent/.test(word) ? 'blDate' : 'usdValue';
      const desc = !/smallest|lowest|lightest|oldest|earliest/.test(word) && !(by === 'blDate' && /date|age/.test(byWord) && !word);
      const at = m.index ?? 0, verb = modeOf(rest.slice(Math.max(0, at - 32), at));
      const mode: TopPick['mode'] = verb === 'exclude' ? 'exclude' : verb === 'only' ? 'only' : 'include';
      (c.bl.top ??= []).push({ n, by, desc, mode });
      applied.push(topLabel({ n, by, desc, mode }));
      cut(at, at + m[0].length);
    }
  });

  // 1c. Contract, notify party, invoice and BL reference: "only contract VAR-CTR-ARA", "exclude notify party Olam".
  const textRe = /\b(notify(?:\s*part(?:y|ies))?|contracts?(?:\s*(?:ref(?:erence)?s?|nos?\.?|numbers?))?|invoices?(?:\s*(?:ref(?:erence)?s?|nos?\.?|numbers?))?|bls?\s*ref(?:erence)?s?|references?)\s*[:#]?\s*/gi;
  for (const k of [...rest.matchAll(textRe)]) {
    const at = k.index ?? 0, word = k[1].toLowerCase(), after = rest.slice(at + k[0].length);
    const field: TextField = word.startsWith('notify') ? 'notifyParty' : word.startsWith('contract') ? 'contractRef' : word.startsWith('invoice') ? 'invoiceRef' : 'blNumber';
    let values: string[] = [], len = 0;
    if (field === 'notifyParty') {
      const v = /^([a-z][\w&.'-]*(?:\s+(?!(?:and|but|with|only|exclude|excluding|without|except|bls?|in|before|after|from|since|between|at|on|contract|invoice|commodity)\b)[\w&.'-]+)*)/i.exec(after);
      if (v) { values = [v[1].trim()]; len = v[0].length; }
    } else {
      const v = /^([a-z0-9*][\w\-/.*]*(?:\s*(?:,|\band\b|\bor\b)\s*[a-z0-9*][\w\-/.*]*)*)/i.exec(after);
      if (v) {
        values = v[1].split(/\s*(?:,|\band\b|\bor\b)\s*/i).filter(x => /[\d*-]/.test(x) && !STOP.has(x.toLowerCase()));
        len = v[0].length;
      }
    }
    if (!values.length) continue;
    const mode = modeOf(rest.slice(Math.max(0, at - 32), at)) === 'exclude' ? 'exclude' : 'only';
    const list = (c.bl.text ??= []);
    const same = list.find(x => x.field === field && x.mode === mode);
    if (same) same.values = [...new Set([...same.values, ...values])]; else list.push({ field, mode, values });
    applied.push(`${mode} ${TEXT_LABEL[field]} ${values.join(', ')}`);
    cut(at, at + k[0].length + len);
  }

  // 2. Numbers of BLs, trade flows and Deal IDs, with what is asked of them (only / must include / exclude).
  const idRe = /\b\d{10}\b/g;
  const lists: Record<string, string[]> = {};
  for (let m = idRe.exec(rest); m; m = idRe.exec(rest)) {
    const before = rest.slice(0, m.index);
    const kind = kindOf(m[0], before);
    if (!kind) { notUnderstood.push(`${m[0]} (not a BL, trade flow or Deal ID number)`); continue; }
    const verbs = [...before.toLowerCase().matchAll(VERB_RE)];
    const verb = verbs.at(-1)?.[1] ?? '';
    // "keep BL 4000000024 out" / "4000000024 excluded": the word after the number decides.
    const outAfter = /^[\s,]*(?:(?:and|,)\s*\d{10}[\s,]*)*(?:out|excluded|removed)\b/i.test(rest.slice(m.index + 10));
    const mode = outAfter ? 'exclude' : /exclude|excluding|without|except|^not$|^no$|remove|skip|avoid|leave out|keep out|other than|don't|dont|do not|never|drop|ignore|minus|apart from/.test(verb) ? 'exclude'
      : /only|just/.test(verb) ? 'only' : verb ? 'include' : kind === 'deal' ? 'only' : 'include';
    const slot = `${kind}:${mode}`;
    (lists[slot] ??= []).push(m[0]);
  }
  rest = rest.replace(/\b\d{10}\b/g, m => ' '.repeat(m.length));
  const uniq = (a: string[]) => [...new Set(a)];
  if (lists['bl:only']) { c.bl.only = uniq(lists['bl:only']); applied.push(`only BL ${c.bl.only.join(', ')}`); }
  if (lists['bl:include']) { c.bl.include = uniq(lists['bl:include']); applied.push(`must include BL ${c.bl.include.join(', ')}`); }
  if (lists['bl:exclude']) { c.bl.exclude = uniq(lists['bl:exclude']); applied.push(`exclude BL ${c.bl.exclude.join(', ')}`); }
  if (lists['tf:only'] || lists['tf:include']) { c.bl.onlyTf = uniq([...(lists['tf:only'] ?? []), ...(lists['tf:include'] ?? [])]); applied.push(`only trade flow ${c.bl.onlyTf.join(', ')}`); }
  if (lists['tf:exclude']) { c.bl.excludeTf = uniq(lists['tf:exclude']); applied.push(`exclude trade flow ${c.bl.excludeTf.join(', ')}`); }
  const dealIds = uniq([...(lists['deal:only'] ?? []), ...(lists['deal:include'] ?? [])]);
  if (dealIds.length) { c.deal.dealIds = dealIds; c.scope = 'all'; applied.push(`Deal ID ${dealIds.join(', ')}`); }
  if (lists['deal:exclude']) notUnderstood.push(`excluding Deal IDs (choose the deal in the list instead)`);
  // The words of the lists are spent too.
  // (The words are kept aside first: a name typed alone later on still needs its "skip" / "only".)
  said = rest;
  rest = rest.replace(/\b(?:exclude|excluding|without|except|remove|skip|avoid|leave out|keep out|other than|don't|dont|do not|never|drop|ignore|minus|apart from|must include|must use|include|including|always)\b(?:\s+(?:bls?|bill(?:s)? of lading|trade\s*flows?|tfs?|deal\s*ids?|numbers?|nos?\.?)(?!\w))?/gi, m => ' '.repeat(m.length));

  // 2b. Fill only part of what is left: "fill 50%", "propose 1 Cr only", "assign up to 50L".
  let tg = /\b(?:fill|assign|propose|allocate|cover)\s+(?:only\s+)?(?:up\s*to\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/i.exec(rest);
  if (tg) {
    const pct = Math.min(100, Number(tg[1]));
    c.target = { pct };
    applied.push(`fill ${fmt(pct)}% of what is left`);
    cut(tg.index, tg.index + tg[0].length);
  } else {
    tg = new RegExp(`\\b(?:fill|assign|propose|allocate|cover)\\s+(?:only\\s+)?(?:up\\s*to\\s+)?(?:usd\\s*)?${NUM}(?!\\s*(?:bls?|trade|tfs?|%))(?:\\s*usd)?(?:\\s+only)?`, 'i').exec(rest);
    if (tg) {
      c.target = { usd: toNumber(tg[1], tg[2]) };
      applied.push(`fill ${fmt(c.target.usd ?? 0)} USD`);
      cut(tg.index, tg.index + tg[0].length);
    }
  }

  // 3. Number of BLs.
  // "between 300 and 400 BLs", "300-400 BLs".
  const span = /\b(?:between\s+)?(\d{1,3})\s*(?:and|to|-|–)\s*(\d{1,3})\s*bls?\b/i.exec(rest);
  if (span) {
    const [lo, hi] = [Number(span[1]), Number(span[2])].sort((a, b) => a - b);
    c.minBls = lo; c.maxBls = hi; applied.push(`between ${lo} and ${hi} BLs`);
    cut(span.index, span.index + span[0].length);
  }
  // "around 350 BLs": within 5% either way.
  const near = /\b(?:around|about|approx(?:imately|\.)?|roughly|nearly|close to|~)\s*(\d{1,3})\s*bls?\b/i.exec(rest);
  if (near) {
    const n = Number(near[1]), d = Math.max(1, Math.round(n * 0.05));
    c.minBls = n - d; c.maxBls = n + d; applied.push(`about ${n} BLs (${n - d}–${n + d})`);
    cut(near.index, near.index + near[0].length);
  }
  const countRules: [RegExp, (n: number) => void][] = [
    [/(?:\b(?:at most|max(?:imum)?|up to|upto|no more than|not more than)|<=?)\s*(\d{1,3})\s*bls?\b/i, n => { c.maxBls = n; applied.push(`at most ${n} BL${n > 1 ? 's' : ''}`); }],
    [/(?:\b(?:at least|min(?:imum)?|no fewer than|not fewer than|no less than|not less than)|>=?)\s*(\d{1,3})\s*bls?\b/i, n => { c.minBls = n; applied.push(`at least ${n} BLs`); }],
    [/\b(?:more than|over|above|greater than)\s*(\d{1,3})\s*bls?\b/i, n => { c.minBls = n + 1; applied.push(`more than ${n} BLs`); }],
    [/\b(?:less than|fewer than|under|below)\s*(\d{1,3})\s*bls?\b/i, n => { c.maxBls = Math.max(1, n - 1); applied.push(`fewer than ${n} BLs`); }],
    [/\b(?:exactly\s+)?(\d{1,3})\s*bls?\s+only\b|\bexactly\s+(\d{1,3})\s*bls?\b/i, n => { c.minBls = n; c.maxBls = n; applied.push(`exactly ${n} BL${n > 1 ? 's' : ''}`); }],
    [/\b(?:one|single|a single|1)\s+bl\b/i, () => { c.maxBls = 1; applied.push('one BL'); }]
  ];
  for (const [re, set] of countRules) {
    const m = re.exec(rest);
    if (m) { set(Number(m[1] ?? m[2] ?? 1)); cut(m.index, m.index + m[0].length); }
  }

  // 4. Dates: between … and …, after / since / from, before / until, on, in <month> [year]. The word before says which
  // date: ETA (arriving), ETD (shipped, sailing), BL date (BL, BLs), else the trade flow date.
  const date = (s: string) => readDate(s.replace(/,/g, ''));
  const dateField = (start: number): DateField => {
    const b = rest.slice(Math.max(0, start - 32), start).toLowerCase();
    let best: DateField = 'tfDate', where = -1;
    const words: [RegExp, DateField][] = [[/\beta\b|\barriv\w*/g, 'eta'], [/\betd\b|\bship\w*|\bsail\w*|\bdepart\w*|\bload\w*/g, 'etd'],
      [/\bbls?\b|\bbills? of lading\b/g, 'blDate'], [/\btrade\s*flows?\b|\btfs?\b/g, 'tfDate']];
    for (const [re, f] of words) for (const x of b.matchAll(re)) if ((x.index ?? -1) >= where) { where = x.index ?? -1; best = f; }
    return best;
  };
  let m = new RegExp(`\\b(?:between|from)\\s+${DATE}\\s+(?:and|to|till|until|-)\\s+${DATE}`, 'i').exec(rest);
  if (m && date(m[1]) && date(m[2])) { c.bl[dateField(m.index)] = { from: date(m[1]), to: date(m[2]) }; cut(m.index, m.index + m[0].length); }
  for (;;) {
    m = new RegExp(`\\b(after|since|from|on or after|before|until|till|up to|on or before|on|dated|older than|earlier than|newer than|later than|younger than)\\s+${DATE}`, 'i').exec(rest);
    if (!m || !date(m[2])) break;
    const d = date(m[2]), f = dateField(m.index);
    const w = ({ 'older than': 'before', 'earlier than': 'before', 'newer than': 'after', 'later than': 'after', 'younger than': 'after' } as Record<string, string>)[m[1].toLowerCase()] ?? m[1].toLowerCase();
    const r = (c.bl[f] ??= {});
    if (w === 'after') Object.assign(r, { from: d, fromStrict: true });
    else if (w === 'since' || w === 'from' || w === 'on or after') Object.assign(r, { from: d, fromStrict: false });
    else if (w === 'before') Object.assign(r, { to: d, toStrict: true });
    else if (w === 'on' || w === 'dated') Object.assign(r, { from: d, to: d, fromStrict: false, toStrict: false });
    else Object.assign(r, { to: d, toStrict: false });
    cut(m.index, m.index + m[0].length);
  }
  // "older than 60 days" / "newer than 10 days" / "last 30 days" (counted back from today).
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const back = (n: number) => { const t = new Date(`${today}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
  for (;;) {
    m = /\b(older|earlier|newer|later|younger)\s+than\s+(\d{1,4})\s*days?\b|\b(?:in\s+)?(?:the\s+)?(?:last|past|within)\s+(\d{1,4})\s*days?\b/i.exec(rest);
    if (!m) break;
    const f = dateField(m.index);
    if (m[1]) c.bl[f] = /older|earlier/i.test(m[1]) ? { ...c.bl[f], to: back(Number(m[2])), toStrict: true } : { ...c.bl[f], from: back(Number(m[2])), fromStrict: true };
    else c.bl[f] = { ...c.bl[f], from: back(Number(m[3])), fromStrict: false };
    cut(m.index, m.index + m[0].length);
  }
  // "from August to September" / "between Aug and Oct 2026".
  for (;;) {
    m = /\b(?:from|between)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:to|and|till|until|-)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i.exec(rest);
    if (!m) break;
    const y = Number(m[3] ?? today.slice(0, 4)), a = MONTHS.indexOf(m[1].toLowerCase()) + 1, b = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    c.bl[dateField(m.index)] = { from: `${y}-${pad(a)}-01`, to: `${y}-${pad(b)}-${pad(lastDay(y, b))}` };
    cut(m.index, m.index + m[0].length);
  }
  // "in October", "from September", "during Aug 2026", or a full month name on its own ("BLs September").
  for (;;) {
    m = /\b(?:in|from|during|for|of|within)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i.exec(rest)
      ?? /\b(jan)uary\b(?:\s+(\d{4}))?|\b(feb)ruary\b(?:\s+(\d{4}))?|\b(mar)ch\b(?:\s+(\d{4}))?|\b(apr)il\b(?:\s+(\d{4}))?|\b(jun)e\b(?:\s+(\d{4}))?|\b(jul)y\b(?:\s+(\d{4}))?|\b(aug)ust\b(?:\s+(\d{4}))?|\b(sep)tember\b(?:\s+(\d{4}))?|\b(oct)ober\b(?:\s+(\d{4}))?|\b(nov)ember\b(?:\s+(\d{4}))?|\b(dec)ember\b(?:\s+(\d{4}))?/i.exec(rest);
    if (!m) break;
    const groups = m.slice(1), at = groups.findIndex(g => g !== undefined && /^[a-z]{3}$/i.test(g));
    if (at < 0) break;
    const mo = MONTHS.indexOf(groups[at].toLowerCase()) + 1, y = Number(groups[at + 1] ?? today.slice(0, 4));
    c.bl[dateField(m.index)] = { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(lastDay(y, mo))}` };
    cut(m.index, m.index + m[0].length);
  }
  for (const f of DATE_FIELDS) { const r = c.bl[f]; if (r) applied.push(dateLabel(f, r)); }

  // 5. Amount and quantity conditions, each with its subject (deal / remaining / BL / quantity).
  const amountRe = new RegExp(`\\bbetween\\s+${NUM}\\s+(?:and|to|-)\\s+${NUM}|${NUM}\\s*(\\+)|(?:^|\\s)(greater than or equal to|less than or equal to|greater than|more than|less than|lower than|higher than|at least|at most|not less than|no less than|not more than|no more than|minimum of|maximum of|minimum|maximum|min\\.?|max\\.?|up to|upto|above|over|below|under|exceeding|exceeds|equal to|equals|exactly|>=|<=|≥|≤|>|<|=)\\s*${NUM}`, 'gi');
  const found: { start: number; end: number; cmp: Cmp }[] = [];
  for (let a = amountRe.exec(rest); a; a = amountRe.exec(rest)) {
    let cmp: Cmp;
    if (a[1] !== undefined) cmp = { op: 'between', value: toNumber(a[1], a[2]), to: toNumber(a[3], a[4]) };
    else if (a[7] === '+') cmp = { op: '>=', value: toNumber(a[5], a[6]) };
    else {
      const word = a[8].trim();
      const op = OPS.find(([re]) => re.test(word))?.[1] ?? '=';
      cmp = { op, value: toNumber(a[9], a[10]) };
    }
    found.push({ start: a.index, end: a.index + a[0].length, cmp });
  }
  const INVERSE: Partial<Record<Op, Op>> = { '>': '<=', '>=': '<', '<': '>=', '<=': '>' };
  for (const f of found.reverse()) {
    // The clause the condition is in (back to the last comma / "and" / "then"), read as typed (said keeps the words the
    // list readers spent, e.g. "exclude BLs").
    const clause = said.toLowerCase().slice(Math.max(0, f.start - 60), f.start).split(/,|;|\band\b|\bthen\b|\bbut\b/).at(-1) ?? '';
    const after = lower().slice(f.end, f.end + 14);
    // The subject nearest before the condition; a unit right after it (LBS, KG, MT) makes it a quantity.
    const subjects: [RegExp, string][] = [[/\b(?:quantity|qty|weight|weighing)\b/g, 'quantity'], [/\b(?:remaining|left|open|balance)\b/g, 'remaining'],
      [/\b(?:bls?|bill(?:s)? of lading)\b/g, 'bl'], [/\bdeals?\b(?!\s+(?:value|worth))/g, 'deal'],
      // "an amount" / "value" alone: the deal's in a search across deals, else the BL's.
      [/\b(?<!deals?\s)(?:value|valued|worth|amount|priced)\b/g, c.scope === 'all' ? 'deal' : 'bl']];
    let subject = '', at = -1;
    for (const [re, s] of subjects) for (const x of clause.matchAll(re)) if ((x.index ?? -1) > at) { at = x.index ?? -1; subject = s; }
    if (/^\s*(?:lbs?|kgs?|mts?|tonnes?|tons?)\b/.test(after)) subject = 'quantity';
    else if (/^\s*(?:left|remaining|open)\b/.test(after)) subject = 'remaining';
    // Nothing named: on a deal's proposals an amount is a BL value (an explicit "deals" search reads it as the deal's).
    if (!subject) subject = c.scope === 'all' ? 'deal' : 'bl';
    // "exclude BLs under 30K" keeps the BLs of 30K and more.
    let cmp = f.cmp;
    if ((subject === 'bl' || subject === 'quantity') && modeOf(clause) === 'exclude') {
      const op = INVERSE[cmp.op];
      if (!op) { notUnderstood.push(`leaving out a range ("${rest.slice(f.start, f.end).trim()}"): say which BLs to keep, e.g. "BLs below 40K"`); cut(f.start, f.end); continue; }
      cmp = { op, value: cmp.value };
    }
    const label = (s: string) => `${s} ${cmp.op === 'between' ? `between ${fmt(cmp.value)} and ${fmt(cmp.to ?? 0)}` : `${cmp.op} ${fmt(cmp.value)}`}${s === 'BL quantity' ? '' : ' USD'}`;
    if (subject === 'deal') { c.deal.amount = cmp; applied.push(label('deal amount')); }
    else if (subject === 'remaining') { c.deal.remaining = cmp; applied.push(label('deal amount left')); }
    else if (subject === 'bl') { c.bl.amount = cmp; applied.push(label('BL value')); }
    else { c.bl.quantity = cmp; applied.push(label('BL quantity')); }
    cut(f.start, f.end);
  }

  // 6. Commodities by code or name (the master's code, description or TSF FX commodity).
  const names = new Map<string, string>();
  for (const r of commodities) for (const k of [str(r.commodity), str(r.description), str(r.tsfCommodity)]) if (k && k.length > 1) names.set(k.toLowerCase(), str(r.commodity) || k);
  const picked: string[] = [];
  for (const [name, code] of [...names].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hit = re.exec(rest);
    if (hit) { if (!picked.includes(code)) picked.push(code); cut(hit.index, hit.index + hit[0].length); }
  }
  if (picked.length) { c.commodity = picked; applied.push(`commodity ${picked.join(', ')}`); }

  // 7. Order.
  const orderWords: [RegExp, () => void][] = [
    [/\b(?:oldest|older)(?:\s+(?:trade\s*flows?|tfs?|shipments?|bls?))?(?:\s+first)?\b/i, () => { (c.order ??= {}).older = true; applied.push('oldest trade flows first'); }],
    [/\b(?:newest|newer|latest)(?:\s+(?:trade\s*flows?|tfs?|shipments?|bls?))?(?:\s+first)?\b/i, () => { (c.order ??= {}).newer = true; applied.push('newest trade flows first'); }],
    [/\bfew(?:er|est)\s+(?:trade\s*flows?|tfs?)\b/i, () => { (c.order ??= {}).fewerTfs = true; applied.push('fewest trade flows'); }]
  ];
  // Ways of filling: "fewest BLs" / "biggest first" / "largest BLs", "closest amount" / "exact match".
  const wayWords: [RegExp, 'fewest' | 'closest'][] = [
    [/\b(?:fewest|fewer|least|minimum number of|min number of|as few)\s+(?:as possible\s+)?bls?\b|\b(?:the\s+)?(?:biggest|largest|highest|big|large)(?:\s+bls?)?(?:\s+first)?\b/i, 'fewest'],
    [/\b(?:closest|exact|nearest|precise|best)\s*(?:amount|match|fill|value|fit)?\b|\bas close as possible\b/i, 'closest']
  ];
  for (const [re, way] of wayWords) {
    const w = re.exec(rest);
    if (!w) continue;
    if (!(c.ways ??= []).includes(way)) c.ways.push(way);
    applied.push(`fill with ${way === 'fewest' ? 'Fewest BLs' : 'Closest amount'}`);
    cut(w.index, w.index + w[0].length);
  }
  for (const [re, set] of orderWords) { const o = re.exec(rest); if (o) { set(); cut(o.index, o.index + o[0].length); } }

  // 7b. A notify party, contract, invoice or BL reference named on its own: its full text, or (a notify party) its first
  // distinctive word. "skip Northwind" leaves it out; "only Blue Harbor" keeps to it.
  for (const f of ['notifyParty', 'contractRef', 'invoiceRef', 'blNumber'] as TextField[]) {
    for (const v of opts.known?.[f] ?? []) {
      const full = v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const first = f === 'notifyParty' ? v.toLowerCase().split(/\s+/)[0] : '';
      const re = new RegExp(`\\b${full}\\b${first.length >= 4 && !STOP.has(first) ? `|\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : ''}`, 'i');
      const hit = re.exec(rest);
      if (!hit) continue;
      const mode = modeOf(said.slice(Math.max(0, hit.index - 32), hit.index)) === 'exclude' || /^\s*(?:out|excluded|removed)\b/i.test(said.slice(hit.index + hit[0].length)) ? 'exclude' : 'only';
      const list = (c.bl.text ??= []);
      const same = list.find(x => x.field === f && x.mode === mode);
      if (same) { if (!same.values.includes(v)) same.values.push(v); } else list.push({ field: f, mode, values: [v] });
      applied.push(`${mode} ${TEXT_LABEL[f]} ${v}`);
      cut(hit.index, hit.index + hit[0].length);
    }
  }

  // 8. Whatever meaningful is left was not understood.
  const left = rest.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (left.some(w => /^(?:smallest|smaller|lowest|lightest)$/i.test(w))) notUnderstood.push(`${left.join(' ')} (to use small BLs say e.g. "bottom 50 BLs" or "BLs below 30K")`);
  else if (left.length) notUnderstood.push(left.join(' '));
  return { criteria: c, applied, notUnderstood };
}

// ---------------------------------------------------------------- applying the criteria

const compare = (v: number, c: Cmp): boolean =>
  c.op === '>' ? v > c.value : c.op === '>=' ? v >= c.value : c.op === '<' ? v < c.value : c.op === '<=' ? v <= c.value
    : c.op === '=' ? Math.abs(v - c.value) < 0.005 : v >= c.value && v <= (c.to ?? c.value);
const inRange = (d: string, r: DateRange): boolean => {
  const x = str(d).slice(0, 10);
  if (!x) return false;
  if (r.from && (r.fromStrict ? !(x > r.from) : x < r.from)) return false;
  if (r.to && (r.toStrict ? !(x < r.to) : x > r.to)) return false;
  return true;
};

/** The TSF FX commodity codes and commodity codes the typed commodities stand for. */
function commodityCodes(typed: string[], master: Row[]): { tsf: Set<string>; codes: Set<string> } {
  const t = typed.map(x => x.toLowerCase());
  const rows = master.filter(r => [str(r.commodity), str(r.description), str(r.tsfCommodity)].some(k => t.includes(k.toLowerCase())));
  return { tsf: new Set([...rows.map(r => str(r.tsfCommodity)).filter(Boolean), ...typed]), codes: new Set(rows.map(r => str(r.commodity))) };
}

export interface DealLike { dealId: string; tsfCommodity: string; tsfCommodityText?: string; usd: string | null; remainingUsd: string }

/** Why a deal does not satisfy the deal conditions, or '' when it does. */
export function dealMismatch(d: DealLike, c: Criteria, master: Row[]): string {
  if (c.deal.dealIds?.length && !c.deal.dealIds.includes(d.dealId)) return `Deal ID ${d.dealId} is not one of ${c.deal.dealIds.join(', ')}.`;
  if (c.deal.amount && !(d.usd !== null && compare(Number(d.usd), c.deal.amount))) return `the deal amount (${d.usd === null ? 'no USD rate' : `${fmt(Number(d.usd))} USD`}) does not meet the condition.`;
  if (c.deal.remaining && !compare(Number(d.remainingUsd || 0), c.deal.remaining)) return `the amount left (${fmt(Number(d.remainingUsd || 0))} USD) does not meet the condition.`;
  if (c.commodity?.length) {
    const { tsf } = commodityCodes(c.commodity, master);
    if (![d.tsfCommodity, d.tsfCommodityText ?? ''].some(x => x && (tsf.has(x) || c.commodity!.some(t => t.toLowerCase() === x.toLowerCase())))) return `the deal is ${d.tsfCommodity}${d.tsfCommodityText ? ` ${d.tsfCommodityText}` : ''}, not ${c.commodity.map(x => str(master.find(r => str(r.commodity) === x)?.description) || x).join(', ')}.`;
  }
  return '';
}

/** A reference matches as typed (any case); "*" stands for any characters; a notify party matches on any part. */
function textMatches(value: string, typed: string, field: TextField): boolean {
  const v = value.toLowerCase(), t = typed.toLowerCase();
  if (t.includes('*')) return new RegExp(`^${t.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(v);
  return field === 'notifyParty' ? v.includes(t) : v === t;
}

/** The BLs that satisfy the BL conditions (on top of the allocation rules the matcher applies). */
export function filterBls(bls: Row[], c: Criteria, master: Row[]): Row[] {
  const codes = c.commodity?.length ? commodityCodes(c.commodity, master).codes : null;
  return bls.filter(b => {
    const no = str(b.blNo);
    if (c.bl.only?.length && !c.bl.only.includes(no) && !c.bl.include?.includes(no)) return false;
    if (c.bl.exclude?.includes(no)) return false;
    if (c.bl.onlyTf?.length && !c.bl.onlyTf.includes(str(b.tfNo))) return false;
    if (c.bl.excludeTf?.includes(str(b.tfNo))) return false;
    if (c.bl.amount && !compare(Number(str(b.usdValue) || 0), c.bl.amount)) return false;
    if (c.bl.quantity && !compare(Number(str(b.quantity) || 0), c.bl.quantity)) return false;
    for (const f of DATE_FIELDS) { const r = c.bl[f]; if (r && !inRange(str(b[f]), r)) return false; }
    if (c.bl.ranges?.length) {
      const only = c.bl.ranges.filter(r => r.mode === 'only');
      if (only.length && !only.some(r => no >= r.from && no <= r.to) && !c.bl.include?.includes(no)) return false;
      if (c.bl.ranges.some(r => r.mode === 'exclude' && no >= r.from && no <= r.to)) return false;
    }
    for (const t of c.bl.text ?? []) {
      const hit = t.values.some(v => textMatches(str(b[t.field]), v, t.field));
      if (t.mode === 'only' ? !hit : hit) return false;
    }
    if (codes && codes.size && !codes.has(str(b.commodity))) return false;
    return true;
  });
}

/** Why a BL the conditions require cannot be used, or ''. */
export function blUnavailable(blNo: string, bls: Row[], deal: { dealId: string }): string {
  const b = bls.find(x => str(x.blNo) === blNo);
  if (!b) return `BL ${blNo} does not exist.`;
  if (str(b.deletedFlag) === 'X') return `BL ${blNo} is deleted.`;
  if (str(b.dealId)) return str(b.dealId) === deal.dealId ? `BL ${blNo} is already assigned to this deal.` : `BL ${blNo} is already assigned to Deal ID ${str(b.dealId)}.`;
  if (!(Number(str(b.usdValue)) > 0)) return `BL ${blNo} has no price for its trade flow date.`;
  return '';
}

/** True when the criteria hold any condition. */
export const hasCriteria = (c: Criteria): boolean => Boolean(c.deal.amount || c.deal.remaining || c.deal.dealIds?.length || c.commodity?.length || c.maxBls || c.minBls
  || c.bl.amount || c.bl.quantity || c.bl.tfDate || c.bl.only?.length || c.bl.include?.length || c.bl.exclude?.length || c.bl.onlyTf?.length || c.bl.excludeTf?.length
  || c.order?.older || c.order?.newer || c.order?.fewerTfs || c.bl.blDate || c.bl.etd || c.bl.eta || c.bl.ranges?.length || c.bl.text?.length || c.bl.top?.length || c.target);

/** The criteria as short chips (what the screen shows under "Applied"). */
export function describeCriteria(c: Criteria): string[] {
  const n = (x: number) => fmt(x);
  const cm = (x: Cmp, unit = ' USD') => (x.op === 'between' ? `between ${n(x.value)} and ${n(x.to ?? x.value)}${unit}` : `${x.op} ${n(x.value)}${unit}`);
  const out: string[] = [];
  if (c.scope === 'all') out.push('across all deals');
  if (c.deal.dealIds?.length) out.push(`Deal ID ${c.deal.dealIds.join(', ')}`);
  if (c.deal.amount) out.push(`deal amount ${cm(c.deal.amount)}`);
  if (c.deal.remaining) out.push(`deal amount left ${cm(c.deal.remaining)}`);
  if (c.bl.amount) out.push(`BL value ${cm(c.bl.amount)}`);
  if (c.bl.quantity) out.push(`BL quantity ${cm(c.bl.quantity, '')}`);
  if (c.bl.only?.length) out.push(`only BL ${c.bl.only.join(', ')}`);
  if (c.bl.include?.length) out.push(`must include BL ${c.bl.include.join(', ')}`);
  if (c.bl.exclude?.length) out.push(`exclude BL ${c.bl.exclude.join(', ')}`);
  if (c.bl.onlyTf?.length) out.push(`only trade flow ${c.bl.onlyTf.join(', ')}`);
  if (c.bl.excludeTf?.length) out.push(`exclude trade flow ${c.bl.excludeTf.join(', ')}`);
  for (const r of c.bl.ranges ?? []) out.push(`${r.mode} BLs ${r.from} – ${r.to}`);
  for (const t of c.bl.text ?? []) out.push(`${t.mode} ${TEXT_LABEL[t.field]} ${t.values.join(', ')}`);
  for (const t of c.bl.top ?? []) out.push(topLabel(t));
  for (const f of DATE_FIELDS) { const r = c.bl[f]; if (r) out.push(dateLabel(f, r)); }
  if (c.target?.pct) out.push(`fill ${n(c.target.pct)}% of what is left`);
  else if (c.target?.usd) out.push(`fill ${n(c.target.usd)} USD`);
  if (c.commodity?.length) out.push(`commodity ${c.commodity.join(', ')}`);
  if (c.maxBls && c.minBls && c.maxBls === c.minBls) out.push(`exactly ${c.maxBls} BL${c.maxBls > 1 ? 's' : ''}`);
  else { if (c.maxBls) out.push(c.maxBls === 1 ? 'one BL' : `at most ${c.maxBls} BLs`); if (c.minBls) out.push(`at least ${c.minBls} BLs`); }
  if (c.order?.older) out.push('oldest trade flows first');
  if (c.order?.newer) out.push('newest trade flows first');
  if (c.order?.fewerTfs) out.push('fewest trade flows');
  for (const w of c.ways ?? []) out.push(`fill with ${w === 'fewest' ? 'Fewest BLs' : w === 'closest' ? 'Closest amount' : 'Oldest trade flows'}`);
  return out;
}

/**
 * Conditions applied one after another, as one: lists are joined, a later amount, date, count or target replaces an
 * earlier one, and "across all deals" holds once asked.
 */
export function mergeCriteria(list: Criteria[]): Criteria {
  const out = emptyCriteria();
  const join = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const o: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      const was = (o[k] as unknown[] | undefined) ?? [];
      o[k] = Array.isArray(v) ? (k === 'ranges' || k === 'text' || k === 'top' ? [...was, ...v] : [...new Set([...was, ...v])]) : v;
    }
    return o;
  };
  for (const c of list) {
    if (c.scope === 'all') out.scope = 'all';
    out.deal = join(out.deal, c.deal) as Criteria['deal'];
    out.bl = join(out.bl, c.bl) as Criteria['bl'];
    if (c.commodity?.length) out.commodity = [...new Set([...(out.commodity ?? []), ...c.commodity])];
    if (c.maxBls) out.maxBls = c.maxBls;
    if (c.minBls) out.minBls = c.minBls;
    if (c.order) out.order = { ...out.order, ...c.order };
    if (c.ways?.length) out.ways = [...new Set([...(out.ways ?? []), ...c.ways])];
    if (c.target) out.target = c.target;
  }
  if (out.bl.text) {
    const by = new Map<string, TextCondition>();
    for (const t of out.bl.text) {
      const k = `${t.field}|${t.mode}`, was = by.get(k);
      by.set(k, was ? { ...was, values: [...new Set([...was.values, ...t.values])] } : { ...t, values: [...t.values] });
    }
    out.bl.text = [...by.values()];
  }
  return out;
}

/** The USD the proposals aim at: what is left, or the part of it the conditions ask for. */
export function targetOf(remainingUsd: string, c: Criteria): string {
  const left = Number(remainingUsd || 0);
  const want = c.target?.pct ? (left * c.target.pct) / 100 : c.target?.usd ?? left;
  return Math.max(0, Math.min(left, want)).toFixed(2);
}
