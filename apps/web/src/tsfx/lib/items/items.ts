// src/lib/items/items.ts
// Header + items modules (spec §5): the selection as list filters, the checks of every row (browser and server),
// and the save plan (creates, updates, deletes by the full key) with its summary.
import { cleanValues, labelOf, problemText, valueFields, type AnyField } from '@tsfx/lib/fields';
import { checkRow, keyOf, str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { AnyList, ListFilter } from '@tsfx/lib/list/types';
import type { ErrorDetail } from '@tsfx/lib/errors';
import type { PlanOp, PlanResult } from '@tsfx/lib/planner';
import type { AnyItemsDef } from '@tsfx/modules/types';

export const DEFAULT_MAX_ROWS = 5000;
export const maxRowsOf = (def: AnyItemsDef): number => def.maxRows ?? DEFAULT_MAX_ROWS;
const selectionNames = (def: AnyItemsDef) => valueFields(def.selection).map(d => d.field);
const fieldLabel = (defs: AnyField[], field: string) => { const d = valueFields(defs).find(x => x.field === field); return d ? labelOf(d) : field; };

/** Item key fields that are not part of the selection (e.g. the GL account). */
export const itemKeys = (def: AnyItemsDef): string[] => def.keys.filter(k => !selectionNames(def).includes(k));

/** The selection as the server accepts it, and the problems that stop it. */
export function checkSelection(def: AnyItemsDef, raw: unknown, lk: unknown): { selection: Row; problems: Record<string, string> } {
  const selection = cleanValues(def.selection, raw);
  const problems = Object.fromEntries(Object.entries(checkRow({ grid: def.selection }, selection, lk, 'edit'))
    .filter(([, p]) => p).map(([f, p]) => [f, problemText(def.selection, f, p)]));
  return { selection, problems };
}

/** A list over the items entity, so a selection runs through the list-query builder (one page of maxRows + 1). */
export function itemsList(def: AnyItemsDef): AnyList {
  return {
    entity: def.entity, keys: def.keys, columns: [], fields: valueFields([...def.selection, ...def.grid]),
    filters: selectionNames(def), defaultSort: { field: itemKeys(def)[0] ?? def.keys[0], dir: 1 }, pageSizes: [maxRowsOf(def) + 1]
  };
}

export const selectionFilters = (def: AnyItemsDef, selection: Row): ListFilter[] =>
  selectionNames(def).map(field => ({ field, op: 'eq' as const, values: [selection[field] ?? ''] }));

/** Problems of the rows (1-based): field types, duplicate item keys, then the module's cross-row rules. */
export function checkItems(def: AnyItemsDef, rows: Row[], selection: Row, lk: unknown): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  const own = itemKeys(def);
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    for (const [field, p] of Object.entries(checkRow({ grid: def.grid }, row, lk, 'edit'))) if (p) out.push({ row: i + 1, field, message: problemText(def.grid, field, p) });
    if (own.some(k => !row[k])) return;
    const k = own.map(f => row[f]).join('~');
    if (seen.has(k)) out.push({ row: i + 1, field: own[0], message: `${own.map(f => fieldLabel(def.grid, f)).join(' / ')} '${own.map(f => row[f]).join(' / ')}' is used twice.` });
    seen.add(k);
  });
  for (const p of def.check?.(rows, selection, lk) ?? []) out.push({ ...(p.row ? { row: p.row } : {}), ...(p.field ? { field: p.field } : {}), message: p.message });
  return out;
}

/**
 * What the browser saw of a stored row, sent back with the save: its key and its version, which is the ETag,
 * or the row's values when the entity has none (a local store, an entity without ETags).
 */
export function seenOf(def: AnyItemsDef, r: Row): Row {
  const key = Object.fromEntries(def.keys.map(k => [k, r[k] ?? '']));
  return r.__etag ? { ...key, __etag: r.__etag } : { ...key, __etag: '', __values: JSON.stringify(cleanValues(def.grid, r)) };
}

/**
 * True when the selection changed since the browser read it: a stored row it did not see (added by someone else),
 * a seen row that is gone, or a row with another version. The save is then refused (409), so nobody's rows are
 * overwritten or deleted unseen.
 */
export function staleSeen(def: AnyItemsDef, stored: Row[], seen: unknown[]): boolean {
  const tab = { keys: def.keys };
  const version = (s: Row) => JSON.stringify([str(s.__etag), str(s.__values)]);
  const versions = new Map<string, string>();
  for (const raw of seen) {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Row;
    const k = keyOf(tab, s);
    if (versions.has(k)) return true;
    versions.set(k, version(s));
  }
  return versions.size !== stored.length || stored.some(r => versions.get(keyOf(tab, r)) !== version(seenOf(def, r)));
}

/** What turns the stored rows of a selection into the rows sent: creates, updates (changed fields) and deletes. */
export function planItems(def: AnyItemsDef, stored: Row[], rows: Row[], selection: Row): { ops: PlanOp[]; result: PlanResult } {
  const tab = { keys: def.keys };
  const names = selectionNames(def);
  const values = valueFields(def.grid).map(d => d.field).filter(f => !def.keys.includes(f));
  const full = (r: Row): Row => ({ ...r, ...Object.fromEntries(names.map(f => [f, selection[f] ?? ''])) });
  const pick = (r: Row): Row => Object.fromEntries(def.keys.map(k => [k, r[k] ?? '']));
  const idOf = (r: Row) => def.keys.map(k => r[k] ?? '').join(' / ');
  const before = new Map(stored.map(r => [keyOf(tab, r), r]));
  const sent = new Set<string>();
  const ops: PlanOp[] = [];
  let skipped = 0;
  for (const raw of rows) {
    const r = full(raw);
    const k = keyOf(tab, r);
    sent.add(k);
    const old = before.get(k);
    if (!old) { ops.push({ op: 'create', id: idOf(r), key: pick(r), data: Object.fromEntries([...def.keys, ...values].map(f => [f, r[f] ?? ''])) }); continue; }
    const clean = cleanValues(def.grid, old);
    const changed = values.filter(f => (clean[f] ?? '') !== (r[f] ?? ''));
    if (!changed.length) { skipped++; continue; }
    ops.push({ op: 'update', id: idOf(r), key: pick(r), data: Object.fromEntries(changed.map(f => [f, r[f] ?? ''])), etag: old.__etag || undefined });
  }
  for (const [k, old] of before) if (!sent.has(k)) ops.push({ op: 'delete', id: idOf(old), key: pick(old), etag: old.__etag || undefined });
  const count = (o: PlanOp['op']) => ops.filter(x => x.op === o).length;
  return { ops, result: { created: count('create'), updated: count('update'), deleted: count('delete'), skipped } };
}

/** "12 changed, 2 new, 1 deleted" (parts that are zero are left out). */
export function changeSummary(r: PlanResult): string {
  const parts = [r.updated && `${r.updated} changed`, r.created && `${r.created} new`, r.deleted && `${r.deleted} deleted`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing has changed';
}
