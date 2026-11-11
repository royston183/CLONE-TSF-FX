import { cleanValues, problemText } from '@tsfx/lib/fields';
import { checkRow, keyOf } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { HttpError } from '@tsfx/lib/errors';
import type { AnyUploadDef } from '@tsfx/modules/types';
import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { backendFor, moduleEntry, serial } from './module-service';
import type { PlanOp } from '@tsfx/lib/planner';
import type { Actor } from '../actor';

/**
 * A row's status: create / update, `duplicate` when its only problem is that it is already stored (or repeats an
 * earlier row of the same file), `invalid` for any other problem. Neither duplicate nor invalid rows are posted.
 */
export interface UploadLineResult { row: number; status: 'create' | 'update' | 'invalid' | 'duplicate'; problems: string[]; values: Row }
export interface UploadCheck { lines: UploadLineResult[]; counts: { create: number; update: number; invalid: number; duplicate: number } }

/** Upload & preview (spec §6.3): every row checked and compared with SAP; post re-checks and sends one changeset. */
export function uploadService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  if (entry.def.kind !== 'upload') throw new HttpError(404, 'Unknown application.');
  const def: AnyUploadDef = entry.def;
  const backend = backendFor(id, entry);
  const max = def.maxRows ?? 5000;
  const tab = { keys: def.keys };
  const pick = (r: Row): Row => Object.fromEntries(def.keys.map(k => [k, r[k] ?? '']));

  async function evaluate(actor: Actor, raw: unknown): Promise<{ check: UploadCheck; rows: Row[]; existing: Map<string, Row> }> {
    if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'The file has no rows to upload.');
    if (raw.length > max) throw new HttpError(400, `Upload at most ${max} rows at a time.`);
    const lk = def.lookups(await backend.lookups(actor));
    const rows = (raw as unknown[]).map(r => cleanValues(def.columns, r));
    const problems: string[][] = rows.map(() => []);
    rows.forEach((row, i) => {
      for (const [f, p] of Object.entries(checkRow({ grid: def.columns }, row, lk, 'add'))) if (p) problems[i].push(problemText(def.columns, f, p));
    });
    for (const p of def.check?.(rows, lk) ?? []) problems[p.row - 1]?.push(p.message);
    // One look-up of the uploaded keys (in chunks), never the whole table.
    const complete = rows.filter(r => def.keys.every(k => r[k]));
    const existing = new Map((await backend.readKeys(actor, def.entity, complete.map(pick))).map(r => [keyOf(tab, r), r]));
    const first = new Map<string, number>();
    const lines = rows.map((row, i): UploadLineResult => {
      const k = keyOf(tab, row);
      const duplicates: string[] = [];
      if (def.keys.every(f => row[f])) {
        const seen = first.get(k);
        if (seen !== undefined) duplicates.push(`Same key as row ${seen + 1}.`); else first.set(k, i);
        if (def.mode === 'create' && existing.has(k)) duplicates.push(`${def.keys.map(f => row[f]).join(' / ')} already exists.`);
      }
      const all = [...problems[i], ...duplicates];
      // Any other problem keeps the row Invalid; a row whose only problem is that it is already there is a Duplicate.
      const status = problems[i].length ? 'invalid' : duplicates.length ? 'duplicate' : existing.has(k) ? 'update' : 'create';
      return { row: i + 1, status, problems: all, values: row };
    });
    const n = (s: UploadLineResult['status']) => lines.filter(l => l.status === s).length;
    return { check: { lines, counts: { create: n('create'), update: n('update'), invalid: n('invalid'), duplicate: n('duplicate') } }, rows, existing };
  }

  return {
    check: async (actor: Actor, input: Record<string, unknown>) => (await evaluate(actor, input.rows)).check,
    post: (actor: Actor, input: Record<string, unknown>) => serial(`${id}|${backend.mode}`, async () => {
      // The preview is never trusted: every row is checked again against what is stored now.
      const { check, rows, existing } = await evaluate(actor, input.rows);
      const bad = check.lines.filter(l => l.status === 'invalid' || l.status === 'duplicate');
      if (def.strict && bad.length) throw new HttpError(422, `${bad.length} rows need attention; nothing was posted.`, bad.map(l => ({ row: l.row, message: l.problems.join(' · ') })));
      const ops: PlanOp[] = check.lines.filter(l => l.status === 'create' || l.status === 'update').map((l): PlanOp => {
        const row = rows[l.row - 1];
        const id = def.keys.map(k => row[k]).join(' / ');
        if (l.status === 'create') return { op: 'create', id, key: pick(row), data: row };
        return { op: 'update', id, key: pick(row), data: Object.fromEntries(Object.entries(row).filter(([f]) => !def.keys.includes(f))), etag: existing.get(keyOf(tab, row))?.__etag || undefined };
      });
      if (!ops.length) throw new HttpError(422, 'No valid rows to post.');
      await backend.apply(actor, def.entity, ops);
      return { created: check.counts.create, updated: check.counts.update, invalid: check.counts.invalid, duplicate: check.counts.duplicate };
    })
  };
}

/** POST /api/modules/:id/upload/check and /post, body { rows }. */
export async function uploadRequest(req: Request, cfg: AppConfig, id: string, what: 'check' | 'post'): Promise<Response> {
  assertTrustedWrite(req, cfg);
  const actor = actorOf(req);
  const input = await readJson(req, 8 * 1024 * 1024);
  const svc = uploadService(cfg, id);
  return json(what === 'check' ? await svc.check(actor, input) : await svc.post(actor, input));
}
