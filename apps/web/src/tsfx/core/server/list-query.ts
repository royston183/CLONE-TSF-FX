// A large list's query: checked against the list's declaration (only declared fields, allowed operators, values
// valid for their field type), turned into OData ($filter, $orderby, $top, $skip, $count) for SAP through the relay, or
// applied in memory by a local store (sample data, or the application's own data), which pages, filters and sorts
// exactly like SAP. Pure: no SAP calls here.
import { behaviourOf, labelOf, typeOf, type AnyField } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';
import { LIST_LIMITS, OPS_BY_TYPE, pageSizesOf, sortColumnsOf, type AnyList, type FilterOp, type ListFilter, type ListPage, type ListQuery, type ListSort } from '@tsfx/lib/list/types';
import { HttpError } from '@tsfx/lib/errors';
import { odataString } from '../odata-string';

const bad = (message: string): never => { throw new HttpError(400, message); };
const fieldOf = (list: AnyList, field: string): AnyField | undefined => list.fields.find(d => d.field === field);
const isFlagType = (d: AnyField) => ['flag', 'toggle'].includes(typeOf(d));
const DECIMAL = new Set(['amount', 'decimal']);
const MAX_DIGITS = 15;
const MAX_PAGE = 1_000_000;
const FLAG_TEXT = /^(x|true|yes|y|1|false|no|n|0)$/i;
/** Digits without leading zeros ('0' stays). Never goes through Number, so no digit is lost or turned into 1e+21. */
const stripZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');
/** A NUMC integer as SAP stores it: zero-padded to its length. */
const padNumc = (def: AnyField, digits: string): string => (def.max ? stripZeros(digits).padStart(def.max, '0') : stripZeros(digits));

function parseFilter(list: AnyList, raw: unknown, lk: unknown): ListFilter {
  const f = (raw && typeof raw === 'object' ? raw : {}) as { field?: unknown; op?: unknown; values?: unknown };
  const field = typeof f.field === 'string' ? f.field : '';
  const def = list.filters?.includes(field) ? fieldOf(list, field) : undefined;
  if (!def) return bad(`Filtering by ${field || '(none)'} is not allowed.`);
  const label = labelOf(def);
  const op = String(f.op) as FilterOp;
  if (!(OPS_BY_TYPE[typeOf(def)] ?? []).includes(op)) return bad(`${label} cannot be filtered with '${op}'.`);
  if (!Array.isArray(f.values)) return bad(`${label}: values must be a list.`);
  if (f.values.length > LIST_LIMITS.values) bad(`${label}: use at most ${LIST_LIMITS.values} values.`);
  const values = f.values.map(v => behaviourOf(def).clean(v, def));
  if (op === 'between' && values.length !== 2) bad(`${label}: give a from and a to value.`);
  if ((op === 'eq' || op === 'contains') && values.length !== 1) bad(`${label}: give one value.`);
  if (op === 'in' && !values.length) bad(`${label}: give at least one value.`);
  if (op === 'between' && !values[0] && !values[1]) bad(`${label}: give a from or a to value.`);
  if (isFlagType(def)) {
    for (const r of f.values) if (!(r === true || r === false || (typeof r === 'string' && (r.trim() === '' || FLAG_TEXT.test(r.trim()))))) bad(`${label}: use yes or no.`);
  }
  for (const v of values) {
    // A range may be open at one end; a flag filter may ask for "not set" ('').
    if (!v) { if (op === 'between' || isFlagType(def)) continue; bad(`${label}: a value is required.`); }
    if (op === 'contains') { if (def.max && v.length > def.max) bad(`${label} allows at most ${def.max} characters.`); continue; }
    const problem = behaviourOf(def).check(v, def, { row: {}, lk });
    if (problem) bad(problem);
    // Digit caps: a value longer than SAP can hold never reaches OData (and never turns into Infinity or 1e+21).
    const t = typeOf(def);
    if (t === 'integer' && !def.max && v.length > MAX_DIGITS) bad(`${label} allows at most ${MAX_DIGITS} digits.`);
    if (DECIMAL.has(t) && !def.precision && stripZeros(v.replace('-', '').split('.')[0]).length > MAX_DIGITS) bad(`${label} allows at most ${MAX_DIGITS} digits before the decimal point.`);
  }
  return { field, op, values };
}

/** The browser's query, checked and cleaned; any problem is a 400 with the field's message. */
export function parseListQuery(list: AnyList, raw: unknown, lk: unknown): ListQuery {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const page = Number(input.page), pageSize = Number(input.pageSize);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) bad(`page must be a whole number from 1 to ${MAX_PAGE}.`);
  const sizes = pageSizesOf(list);
  if (!sizes.includes(pageSize)) bad(`pageSize must be one of ${sizes.join(', ')}.`);
  if (!Number.isSafeInteger((page - 1) * pageSize)) bad('page is too large.');
  const search = typeof input.search === 'string' ? input.search.trim() : '';
  if (search.length > LIST_LIMITS.search) bad(`Search allows at most ${LIST_LIMITS.search} characters.`);
  if (search && !list.search?.length) bad('This list has no search.');
  const rawFilters: unknown[] = input.filters === undefined ? [] : Array.isArray(input.filters) ? input.filters : bad('filters must be a list.');
  if (rawFilters.length > LIST_LIMITS.filters) bad(`Use at most ${LIST_LIMITS.filters} filters.`);
  const filters = rawFilters.map(f => parseFilter(list, f, lk));
  let sort: ListSort | undefined;
  if (input.sort !== undefined) {
    const s = (input.sort && typeof input.sort === 'object' ? input.sort : {}) as { field?: unknown; dir?: unknown };
    const field = typeof s.field === 'string' ? s.field : '';
    if (!sortColumnsOf(list).includes(field)) bad(`Sorting by ${field || '(none)'} is not allowed.`);
    if (s.dir !== 1 && s.dir !== -1) bad('sort.dir must be 1 or -1.');
    sort = { field, dir: s.dir as 1 | -1 };
  }
  return { ...(search ? { search } : {}), filters, ...(sort ? { sort } : {}), page, pageSize };
}

/** OData property names and the contract facts that decide how a value is written. */
export interface ODataNames { prop: (field: string) => string; numbers: Set<string>; flagType?: 'boolean' | 'char' }

/** One checked value as an OData literal of its field's type: strings quoted (quotes doubled), dates and numbers bare. */
export function literal(def: AnyField, value: string, names: ODataNames): string {
  const t = typeOf(def);
  if (t === 'amount' || t === 'decimal' || t === 'date') return value;
  if (t === 'integer') return names.numbers.has(def.field) ? stripZeros(value) : odataString(padNumc(def, value));
  if (t === 'flag' || t === 'toggle') return names.flagType === 'boolean' ? String(value === 'X') : odataString(value);
  return odataString(value);
}

export const orderOf = (list: AnyList, q: ListQuery): ListSort[] => {
  const sort = q.sort ?? list.defaultSort;
  // The keys after the sort field make paging stable: no row appears on two pages.
  return [sort, ...list.keys.filter(k => k !== sort.field).map(k => ({ field: k, dir: 1 as const }))];
};

/** `$filter` (search OR-ed across its fields, AND-ed with every filter), `$orderby`, `$top`, `$skip`, `$count`. */
export function listODataQuery(list: AnyList, q: ListQuery, names: ODataNames): URLSearchParams {
  const clauses: string[] = [];
  if (q.search) {
    const parts = (list.search ?? []).map(f => `contains(${names.prop(f)},${odataString(q.search)})`);
    if (parts.length) clauses.push(parts.length > 1 ? `(${parts.join(' or ')})` : parts[0]);
  }
  for (const f of q.filters ?? []) {
    const def = fieldOf(list, f.field);
    if (!def) continue;
    const p = names.prop(f.field);
    const lit = (v: string) => literal(def, v, names);
    if (f.op === 'eq') clauses.push(`${p} eq ${lit(f.values[0])}`);
    else if (f.op === 'contains') clauses.push(`contains(${p},${odataString(f.values[0])})`);
    else if (f.op === 'in') clauses.push(f.values.length > 1 ? `(${f.values.map(v => `${p} eq ${lit(v)}`).join(' or ')})` : `${p} eq ${lit(f.values[0])}`);
    else {
      const range = [f.values[0] ? `${p} ge ${lit(f.values[0])}` : '', f.values[1] ? `${p} le ${lit(f.values[1])}` : ''].filter(Boolean);
      clauses.push(range.length > 1 ? `(${range.join(' and ')})` : range[0]);
    }
  }
  const out = new URLSearchParams();
  if (clauses.length) out.set('$filter', clauses.join(' and '));
  out.set('$orderby', orderOf(list, q).map(s => `${names.prop(s.field)} ${s.dir === 1 ? 'asc' : 'desc'}`).join(','));
  out.set('$top', String(q.pageSize));
  out.set('$skip', String((q.page - 1) * q.pageSize));
  out.set('$count', 'true');
  return out;
}

/** Compares decimal strings exactly (sign, whole-part length, then digits): no Number, so no precision is lost. */
function decimalCmp(a: string, b: string): number {
  const parse = (s: string) => {
    const neg = s.startsWith('-');
    const [w, f = ''] = s.replace(/^[-+]/, '').split('.');
    return { neg, whole: stripZeros(w || '0'), frac: f.replace(/0+$/, '') };
  };
  const x = parse(a), y = parse(b);
  const zero = (p: { whole: string; frac: string }) => p.whole === '0' && !p.frac;
  const sx = zero(x) ? 0 : x.neg ? -1 : 1, sy = zero(y) ? 0 : y.neg ? -1 : 1;
  if (sx !== sy) return sx < sy ? -1 : 1;
  if (sx === 0) return 0;
  let m = x.whole.length !== y.whole.length ? (x.whole.length < y.whole.length ? -1 : 1) : 0;
  if (!m) {
    const n = Math.max(x.frac.length, y.frac.length);
    const wx = x.whole + x.frac.padEnd(n, '0'), wy = y.whole + y.frac.padEnd(n, '0');
    m = wx < wy ? -1 : wx > wy ? 1 : 0;
  }
  return m * sx;
}

/** The same query on rows held in memory (a local store): same filter, same order, same page as SAP. */
/** A–Z as a–z; every other character as it is. */
export const asciiLower = (v: string): string => v.replace(/[A-Z]+/g, m => m.toLowerCase());

export function applyQuery(rows: Row[], q: ListQuery, list: AnyList, numbers: ReadonlySet<string> = new Set(), o: { caseless?: boolean } = {}): ListPage {
  // Same rule as the OData side: amounts and decimals compare as numbers, integers only when SAP holds them as
  // numbers (listed in `numbers`) or have no length; a NUMC integer (with max) compares as its zero-padded string.
  const kind = (field: string): 'number' | 'padded' | 'text' => {
    const d = fieldOf(list, field);
    if (!d) return 'text';
    const t = typeOf(d);
    if (DECIMAL.has(t) || (t === 'integer' && (numbers.has(field) || !d.max))) return 'number';
    return t === 'integer' ? 'padded' : 'text';
  };
  const cmp = (field: string, a: string, b: string): number => {
    const k = kind(field);
    if (k === 'number' && a !== '' && b !== '') return decimalCmp(a, b);
    if (k === 'padded' && a !== '' && b !== '') { const d = fieldOf(list, field) as AnyField; a = padNumc(d, a); b = padNumc(d, b); }
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const value = (r: Row, f: string) => r[f] ?? '';
  // Search is case-sensitive like SAP contains(); the application's own data (caseless) ignores the case of A–Z only, as
  // SQLite's LOWER() does, so its tables and this fallback find the same rows.
  const fold = (v: string) => (o.caseless ? asciiLower(v) : v);
  const search = fold(q.search ?? '');
  const match = (r: Row) => {
    if (q.search && !(list.search ?? []).some(f => fold(value(r, f)).includes(search))) return false;
    return (q.filters ?? []).every(f => {
      const v = value(r, f.field);
      if (f.op === 'eq' || f.op === 'in') return f.values.some(x => cmp(f.field, v, x) === 0);
      if (f.op === 'contains') return v.includes(f.values[0]);
      const [from, to] = f.values;
      return (!from || cmp(f.field, v, from) >= 0) && (!to || cmp(f.field, v, to) <= 0);
    });
  };
  const order = orderOf(list, q);
  const all = rows.filter(match).sort((a, b) => {
    for (const s of order) { const c = cmp(s.field, value(a, s.field), value(b, s.field)); if (c) return c * s.dir; }
    return 0;
  });
  const start = (q.page - 1) * q.pageSize;
  return { rows: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize };
}
