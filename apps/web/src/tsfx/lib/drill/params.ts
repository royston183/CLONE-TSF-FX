// src/lib/drill/params.ts
// Drill navigation lives in the URL (spec §5): `s.<field>` is a report's or dashboard's own selection, `f.<field>` the
// drill filters a target starts with, `from` the same-app page to go back to, `hl` the row to outline there, `drill` the
// breakdown stack, `u` the display unit (see use-unit.ts). Every value is checked like user input: nothing here trusts the URL. Pure.
import { behaviourOf, optionsFor, typeOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';

export const MAX_PARAM = 200;
export const MAX_DRILL = 10;
export const DRILL_DROPPED = 'Some drill filters were not applied.';

/** A same-app path (with its query) to go back to, or null: one leading '/', no '//' or '\', no scheme, no control characters. */
export function safeFrom(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, 'http://app.invalid');
    const out = `${url.pathname}${url.search}`;
    // Dot segments are removed by normalisation, so `/.//x` becomes `//x`: check the result too.
    return url.origin === 'http://app.invalid' && out.startsWith('/') && !out.startsWith('//') && !out.includes('\\') ? out : null;
  } catch {
    return null;
  }
}

const CHOICES = new Set(['select', 'segmented', 'period', 'multiSelect']);

/** False for a choice field with no options to check against (a field's check() accepts anything then). */
function hasOptions(def: AnyField, row: Row, lk: unknown): boolean {
  const t = typeOf(def);
  if (t === 'suggest') return (def.lookup?.(lk, row) ?? []).length > 0;
  return !CHOICES.has(t) || optionsFor(def, lk).length > 0;
}

export interface ParsedParams { values: Row; dropped: string[] }

/**
 * The `<prefix>.<field>` parameters for these fields, each cleaned and checked by its field type. Unknown fields,
 * invalid values, repeats and values over MAX_PARAM characters are dropped (their names returned), never passed on.
 * An empty value is no filter. A choice field (select, suggest, …) whose option list is empty — the lookups are not in —
 * cannot check its value, so the value is dropped rather than passed on unchecked.
 */
export function parseDrillParams(params: URLSearchParams, prefix: 's' | 'f', fields: AnyField[], lk: unknown): ParsedParams {
  const defs = new Map(valueFields(fields).map(d => [d.field, d] as const));
  const values: Row = {};
  const dropped: string[] = [];
  for (const [key, raw] of params) {
    if (!key.startsWith(`${prefix}.`) || raw === '') continue;
    const field = key.slice(prefix.length + 1);
    const def = defs.get(field);
    if (!def || raw.length > MAX_PARAM || Object.hasOwn(values, field)) { dropped.push(field); continue; }
    const value = behaviourOf(def).clean(raw, def);
    if (!value || !hasOptions(def, values, lk) || behaviourOf(def).check(value, def, { row: values, lk })) { dropped.push(field); continue; }
    values[field] = value;
  }
  return { values, dropped };
}

/** A page's selection from its URL: f.* (drill filters), then s.* (its own, wins). `given`: the URL asks for a run. */
export function urlSelection(params: URLSearchParams, fields: AnyField[], lk: unknown): ParsedParams & { given: boolean } {
  const f = parseDrillParams(params, 'f', fields, lk);
  const s = parseDrillParams(params, 's', fields, lk);
  const given = [...params.keys()].some(k => k === 's' || k.startsWith('s.') || k.startsWith('f.'));
  return { values: { ...f.values, ...s.values }, dropped: [...new Set([...f.dropped, ...s.dropped])], given };
}

/**
 * The run a page's URL holds after `selectionParams(selection)`: the filled values in the selection's order, exactly as
 * urlSelection reads them back. Equal JSON means Run / Show would send the same request again (so it must retry).
 */
export const urlRunOf = (selection: Row): Row => Object.fromEntries(Object.entries(selection).filter(([, v]) => v));

/** `s.<field>` (or `f.<field>`) parameters of the filled values, in the selection's order. */
export function selectionParams(selection: Row, prefix: 's' | 'f' = 's'): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(selection)) if (v) p.set(`${prefix}.${k}`, v);
  return p;
}

/** A page's own URL with its selection (an empty selection still asks for a run: `?s=`) and extra parameters. */
export function pageWith(pathname: string, selection: Row, extra: Record<string, string> = {}): string {
  const p = selectionParams(selection);
  if (![...p.keys()].length) p.set('s', '');
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `${pathname}?${p}`;
}

/**
 * A drill to another screen: the target's path, its filters as f.*, the page to come back to (when safe) and extra
 * parameters (`u`: the display unit, which a report or dashboard target takes only when it is one of its own units).
 */
export function drillHref(path: string, filters: Record<string, string>, from: string | null, extra: Record<string, string> = {}): string {
  const p = selectionParams(filters, 'f');
  const back = safeFrom(from);
  if (back) p.set('from', back);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

/** Opens one object of an object module (`?open=`), with the page to come back to. */
export function openHref(path: string, open: string, from: string | null): string {
  const p = new URLSearchParams({ open });
  const back = safeFrom(from);
  if (back) p.set('from', back);
  return `${path}?${p}`;
}

export interface DrillLevel { row: string; column: string | null }

/** `?drill=`: a JSON list of at most MAX_DRILL levels `{ row, column }`; anything malformed is no stack at all. */
export function drillStack(raw: string | null): DrillLevel[] {
  if (!raw || raw.length > 4000) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.length > MAX_DRILL) return [];
    const out: DrillLevel[] = [];
    for (const x of v) {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      if (typeof o.row !== 'string' || !o.row || o.row.length > MAX_PARAM) return [];
      if (o.column !== null && (typeof o.column !== 'string' || o.column.length > MAX_PARAM)) return [];
      out.push({ row: o.row, column: o.column as string | null });
    }
    return out;
  } catch {
    return [];
  }
}
