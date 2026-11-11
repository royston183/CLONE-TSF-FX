// src/lib/object/object.ts
// One business object with its items (spec §4): its key in URLs, cleaning, the checks that run in the browser and
// again on the server, the save plan (changed header fields; items created / updated / deleted by key) and the
// review summary. Pure: no React, no server-only.
import { cleanValues, labelOf, problemText, typeOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import { checkRow } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { ErrorDetail } from '@tsfx/lib/errors';
import type { AnyItemsTab, AnyObjectDef, ItemProblem, ObjectProblems } from '@tsfx/modules/types';

export interface ObjectData { header: Row; items: Record<string, Row[]> }
export interface ItemChange { tab: string; op: 'create' | 'update' | 'delete'; key: Row; data: Row; etag?: string }
export interface ObjectDiff { header: Row; items: ItemChange[]; counts: Record<string, { created: number; updated: number; deleted: number }> }

const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.map(k => [k, row[k] ?? '']));
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const fieldLabel = (defs: AnyField[], field: string) => { const d = valueFields(defs).find(x => x.field === field); return d ? labelOf(d) : field; };

export const itemsTabs = (def: AnyObjectDef): AnyItemsTab[] => def.tabs.filter((t): t is AnyItemsTab => t.kind === 'items');

/** Header fields: the head block, then every field group (the first definition of a field wins). */
export function headerFields(def: AnyObjectDef): AnyField[] {
  const all: AnyField[] = [...def.header, ...def.tabs.flatMap(t => (t.kind === 'fields' ? t.groups.flatMap(g => g.fields) : []))];
  return all.filter((d, i) => all.findIndex(x => x.field === d.field) === i);
}
/** The header fields the server sets on create (`initial`), cleaned by their fields; keys that are not header value fields are dropped. */
export function initialHeader(def: AnyObjectDef): Row {
  const raw = def.initial?.() ?? {};
  return cleanValues(valueFields(headerFields(def)).filter(d => Object.hasOwn(raw, d.field)), raw);
}
/** Header fields an edit cannot change on this stored record: its lockedFields and every field `initial` sets (actions change those). */
export const lockedHeader = (def: AnyObjectDef, header: Row): string[] => [...(def.lockedFields?.(header) ?? []), ...Object.keys(initialHeader(def))];
/** The item's own key fields; the header keys are set by the server, never edited in the grid. */
export const ownKeys = (def: AnyObjectDef, tab: AnyItemsTab): string[] => tab.keys.filter(k => !def.list.keys.includes(k));
export const keyText = (keys: string[], row: Row): string => keys.map(k => row[k] ?? '').join(' / ');

/** ?open= of an object: the key value for one key field, else a JSON array of the values. */
export const openParam = (keys: string[], row: Row): string => (keys.length === 1 ? row[keys[0]] ?? '' : JSON.stringify(keys.map(k => row[k] ?? '')));
export function keyFromParam(keys: string[], param: string | null): Row | null {
  if (!param) return null;
  if (keys.length === 1) return { [keys[0]]: param };
  try {
    const v: unknown = JSON.parse(param);
    if (!Array.isArray(v) || v.length !== keys.length || !v.every(x => typeof x === 'string' && x)) return null;
    return Object.fromEntries(keys.map((k, i) => [k, v[i] as string]));
  } catch {
    return null;
  }
}

/** What a browser sent, cleaned by the field types: the header fields and the rows of every items tab. */
export function cleanObject(def: AnyObjectDef, raw: unknown): ObjectData {
  const input = asRecord(raw);
  const items = asRecord(input.items);
  return {
    header: cleanValues(headerFields(def), input.header),
    items: Object.fromEntries(itemsTabs(def).map(t => [t.id, (Array.isArray(items[t.id]) ? items[t.id] as unknown[] : []).map(r => cleanValues(t.grid, r))]))
  };
}

/**
 * The object an update asks for, as the server takes it: the sent header and items, except that an items tab which
 * is not editable, or which the browser did not send, keeps its stored items (a missing tab never deletes them).
 */
export function savedObject(def: AnyObjectDef, stored: ObjectData, raw: unknown): ObjectData {
  const data = cleanObject(def, raw);
  const sent = asRecord(asRecord(raw).items);
  return {
    header: data.header,
    items: Object.fromEntries(itemsTabs(def).map(t => [t.id, t.editable === false || !Array.isArray(sent[t.id])
      ? (stored.items[t.id] ?? []).map(r => cleanValues(t.grid, r))
      : data.items[t.id] ?? []]))
  };
}

export const emptyProblems = (): ObjectProblems => ({ header: {}, items: {}, messages: [] });
export const hasProblems = (p: ObjectProblems): boolean => Object.keys(p.header).length > 0 || Object.values(p.items).some(l => l.length > 0) || p.messages.length > 0;

/** Field types, unique item keys, then the module's own check (a non-empty module message replaces the type message). */
export function checkObject(def: AnyObjectDef, data: ObjectData, lk: unknown, mode: 'create' | 'edit'): ObjectProblems {
  const out = emptyProblems();
  const m = mode === 'create' ? 'add' : 'edit';
  const hdefs = headerFields(def);
  for (const [f, p] of Object.entries(checkRow({ grid: hdefs }, data.header, lk, m))) {
    // SAP assigns the key of a new object: there is nothing to check before it exists.
    if (!p || (mode === 'create' && def.keyBySap && def.list.keys.includes(f))) continue;
    out.header[f] = problemText(hdefs, f, p);
  }
  for (const t of itemsTabs(def)) {
    const own = ownKeys(def, t);
    const list: ItemProblem[] = [];
    const seen = new Set<string>();
    (data.items[t.id] ?? []).forEach((row, i) => {
      for (const [f, p] of Object.entries(checkRow({ grid: t.grid }, row, lk, m))) if (p) list.push({ row: i + 1, field: f, message: problemText(t.grid, f, p) });
      if (own.some(k => !row[k])) return;
      const k = own.map(f => row[f]).join('~');
      if (seen.has(k)) list.push({ row: i + 1, field: own[0], message: `${own.map(f => fieldLabel(t.grid, f)).join(' / ')} '${own.map(f => row[f]).join(' / ')}' is used twice.` });
      seen.add(k);
    });
    out.items[t.id] = list;
  }
  const extra = def.check?.(data.header, data.items, lk, mode);
  if (extra) {
    for (const [f, p] of Object.entries(extra.header)) if (p) out.header[f] = p;
    for (const [tab, list] of Object.entries(extra.items)) out.items[tab] = [...(out.items[tab] ?? []), ...list];
    out.messages.push(...extra.messages);
  }
  return out;
}

/** What turns `before` (as stored) into `after`: changed header fields only, items by their own key. Both sides are cleaned. */
export function diffObject(def: AnyObjectDef, before: ObjectData, after: ObjectData): ObjectDiff {
  const hdefs = headerFields(def);
  const old = cleanValues(hdefs, before.header), now = cleanValues(hdefs, after.header);
  const fields = valueFields(hdefs).map(d => d.field).filter(f => !def.list.keys.includes(f));
  const header = Object.fromEntries(fields.filter(f => old[f] !== now[f]).map(f => [f, now[f]]));
  const items: ItemChange[] = [];
  const counts: ObjectDiff['counts'] = {};
  for (const t of itemsTabs(def)) {
    const own = ownKeys(def, t);
    const values = valueFields(t.grid).map(d => d.field).filter(f => !own.includes(f));
    const keyOfRow = (r: Row) => own.map(f => r[f] ?? '').join('~');
    const stored = new Map((before.items[t.id] ?? []).map(r => { const row = cleanValues(t.grid, r); return [keyOfRow(row), { row, etag: r.__etag }] as const; }));
    // keyBySap: a new row has no key yet; give each its own placeholder so two new rows never merge into one create.
    let fresh = 0;
    const sentKey = (row: Row) => (t.keyBySap && own.every(f => !row[f]) ? `__new${++fresh}` : keyOfRow(row));
    const sent = new Map((after.items[t.id] ?? []).map(r => { const row = cleanValues(t.grid, r); return [sentKey(row), row] as const; }));
    const c = { created: 0, updated: 0, deleted: 0 };
    for (const [k, row] of sent) {
      const s = stored.get(k);
      if (!s) { items.push({ tab: t.id, op: 'create', key: pick(row, own), data: row }); c.created++; continue; }
      const changed = values.filter(f => s.row[f] !== row[f]);
      if (changed.length) { items.push({ tab: t.id, op: 'update', key: pick(row, own), data: Object.fromEntries(changed.map(f => [f, row[f]])), etag: s.etag }); c.updated++; }
    }
    for (const [k, s] of stored) if (!sent.has(k)) { items.push({ tab: t.id, op: 'delete', key: pick(s.row, own), data: {}, etag: s.etag }); c.deleted++; }
    counts[t.id] = c;
  }
  return { header, items, counts };
}

export const isUnchanged = (d: ObjectDiff): boolean => !Object.keys(d.header).length && !d.items.length;

/** "Cash Flows: 2 added, 1 changed, 1 deleted" per items tab with changes (the review dialog's summary). */
export function itemsSummary(def: AnyObjectDef, d: ObjectDiff): string[] {
  return itemsTabs(def).flatMap(t => {
    const c = d.counts[t.id];
    const parts = c ? [c.created && `${c.created} added`, c.updated && `${c.updated} changed`, c.deleted && `${c.deleted} deleted`].filter(Boolean) : [];
    return parts.length ? [`${t.label}: ${parts.join(', ')}`] : [];
  });
}

/** Values of a new item row: each own integer key one above the highest in the grid (No. 1, 2, 3 …), plus `offset`. */
export function nextItemValues(def: AnyObjectDef, tab: AnyItemsTab, values: Record<string, string | boolean>[], offset = 0): Record<string, string> {
  return Object.fromEntries(ownKeys(def, tab).flatMap(k => {
    const d = tab.grid.find(f => f.field === k);
    if (!d || typeOf(d) !== 'integer') return [];
    const top = values.reduce((n, v) => Math.max(n, Number(v[k]) || 0), 0);
    return [[k, String(top + 1 + offset)]];
  }));
}

/** Problems as the 422 `details` the API already sends ({ tab?, row?, field?, message }). */
export function problemsToDetails(p: ObjectProblems): ErrorDetail[] {
  return [
    ...Object.entries(p.header).map(([field, message]) => ({ field, message })),
    ...Object.entries(p.items).flatMap(([tab, list]) => list.map(x => ({ tab, row: x.row, field: x.field, message: x.message }))),
    ...p.messages.map(message => ({ message }))
  ];
}
export function detailsToProblems(details: ErrorDetail[]): ObjectProblems {
  const out = emptyProblems();
  for (const d of details) {
    if (d.tab && d.row) (out.items[d.tab] ??= []).push({ row: d.row, field: d.field ?? '', message: d.message });
    else if (d.field) out.header[d.field] = d.message;
    else out.messages.push(d.message);
  }
  return out;
}
