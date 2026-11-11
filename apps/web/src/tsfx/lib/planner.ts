// Turns the rows a browser sent into SAP operations, re-validating them with the module's own rules against
// the table as it is now (ported from ALM engine/timebuckets.py `plan`, made generic for every module).
import { cleanValues, labelOf as fieldLabel, valueFields } from '@tsfx/lib/fields';
import { checkRow, keyOf, str } from '@tsfx/lib/grid/grid';
import type { Row, StampFields, TabDef } from '@tsfx/lib/grid/types';
import type { ErrorDetail } from '@tsfx/lib/errors';

export type ChangeOp = 'create' | 'update' | 'delete';
export interface PlanOp { op: ChangeOp; id: string; key: Row; data?: Row; etag?: string }
export interface PlanResult { created: number; updated: number; deleted: number; skipped: number }
export type Plan = { ok: true; ops: PlanOp[]; result: PlanResult } | { ok: false; errors: ErrorDetail[] };
export const MAX_ROWS = 1000;

const labelOf = <L>(tab: TabDef<L>, field: string) => {
  const d = valueFields(tab.grid).find(c => c.field === field);
  return d ? fieldLabel(d) : field;
};

/** A row as the server accepts it: every value field cleaned by its type, flags as 'X' or ''. */
export function cleanRow<L>(tab: TabDef<L>, raw: unknown): Row {
  return cleanValues(tab.grid, raw);
}

export function planChanges<L>(tab: TabDef<L>, op: ChangeOp, rows: unknown, current: Row[], lk: L): Plan {
  if (!Array.isArray(rows) || !rows.length) return { ok: false, errors: [{ message: 'Send at least one row to save.' }] };
  if (rows.length > MAX_ROWS) return { ok: false, errors: [{ message: `Save at most ${MAX_ROWS} rows at a time.` }] };
  const existing = new Map(current.map(r => [keyOf(tab, r), r]));
  const keyLabel = tab.keys.map(k => labelOf(tab, k)).join(' / ');
  const errors: ErrorDetail[] = [];
  const ops: PlanOp[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  rows.forEach((raw, i) => {
    const number = i + 1;
    const row = cleanRow(tab, raw);
    // The ETag of the row as the person saw it: SAP refuses the change (412) if someone saved it since.
    // Only when the browser sent none is the ETag just read used.
    const seenEtag = str((raw as Record<string, unknown> | null)?.__etag);
    const fail = (field: string, message: string) => { errors.push({ row: number, field, message }); };
    const missing = tab.keys.find(k => !row[k]);
    if (missing) return fail(missing, `${labelOf(tab, missing)} is required`);
    const key = keyOf(tab, row), keyText = tab.keys.map(k => row[k]).join(' / ');
    if (seen.has(key)) return fail(tab.keys[0], `${keyLabel} '${keyText}' is duplicated in this batch`);
    seen.add(key);
    const now = existing.get(key);
    const keyRow: Row = Object.fromEntries(tab.keys.map(k => [k, row[k]]));
    if (op === 'delete') {
      if (!now) return fail(tab.keys[0], `${keyLabel} '${keyText}' no longer exists`);
      ops.push({ op, id: keyText, key: keyRow, etag: seenEtag || now.__etag || undefined });
      return;
    }
    if (op === 'create' && now) fail(tab.keys[0], `${keyLabel} '${keyText}' already exists`);
    if (op === 'update' && !now) fail(tab.keys[0], `${keyLabel} '${keyText}' no longer exists`);
    for (const [field, problem] of Object.entries(checkRow(tab, row, lk, op === 'create' ? 'add' : 'edit'))) {
      if (problem) fail(field, problem.includes(' ') ? problem : `${labelOf(tab, field)} is ${problem}`);
    }
    if (errors.some(e => e.row === number)) return;
    const data: Row = Object.fromEntries(Object.entries(row).filter(([f]) => !tab.keys.includes(f)));
    if (op === 'update' && now) {
      const before = cleanRow(tab, now);
      if (Object.keys(data).every(f => data[f] === before[f])) { skipped++; return; }
      ops.push({ op, id: keyText, key: keyRow, data, etag: seenEtag || now.__etag || undefined });
      return;
    }
    ops.push({ op, id: keyText, key: keyRow, data: { ...keyRow, ...data } });
  });
  if (errors.length) return { ok: false, errors };
  const count = (o: ChangeOp) => ops.filter(x => x.op === o).length;
  return { ok: true, ops, result: { created: count('create'), updated: count('update'), deleted: count('delete'), skipped } };
}

export function stampNow(now = new Date()): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`, time: `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}` };
}

/** The table after applying planned operations, with created/changed stamps (local stores only; SAP stamps itself). */
export function applyLocal(tab: { keys: string[] }, stamps: StampFields | undefined, current: Row[], ops: PlanOp[], user: string, now = new Date()): Row[] {
  const { date, time } = stampNow(now);
  const who = user.slice(0, 12).toUpperCase();
  const created: Row = stamps ? { [stamps[0]]: who, [stamps[1]]: date, [stamps[2]]: time, [stamps[3]]: '', [stamps[4]]: '', [stamps[5]]: '' } : {};
  const changed: Row = stamps ? { [stamps[3]]: who, [stamps[4]]: date, [stamps[5]]: time } : {};
  let rows = current.map(r => ({ ...r }));
  for (const o of ops) {
    const k = keyOf(tab, o.key);
    if (o.op === 'delete') rows = rows.filter(r => keyOf(tab, r) !== k);
    else if (o.op === 'update') rows = rows.map(r => (keyOf(tab, r) === k ? { ...r, ...o.data, ...changed } : r));
    else rows.push({ ...o.data, ...created });
  }
  return rows;
}
