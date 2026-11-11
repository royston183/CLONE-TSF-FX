import { cleanValues } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';
import { checkItems, checkSelection, itemsList, maxRowsOf, planItems, selectionFilters, staleSeen } from '@tsfx/lib/items/items';
import type { AnyItemsDef } from '@tsfx/modules/types';
import { HttpError } from '@tsfx/lib/errors';
import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { backendFor, moduleEntry, serial } from './module-service';
import { CONFLICT_MESSAGE } from './backend';
import type { PlanResult } from '@tsfx/lib/planner';
import type { Actor } from '../actor';

/** Header + items (spec §5): one selection's rows, saved as one changeset after the server re-checks every row. */
export function itemsService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  if (entry.def.kind !== 'items') throw new HttpError(404, 'Unknown application.');
  const def: AnyItemsDef = entry.def; // typed once: narrowing does not carry into the hoisted function below
  const backend = backendFor(id, entry);
  const list = itemsList(def);
  const max = maxRowsOf(def);
  const lookups = async (actor: Actor) => def.lookups(await backend.lookups(actor));

  async function selected(actor: Actor, raw: unknown, lk: unknown): Promise<{ selection: Row; rows: Row[] }> {
    const { selection, problems } = checkSelection(def, raw, lk);
    const first = Object.values(problems)[0];
    if (first) throw new HttpError(400, first, Object.entries(problems).map(([field, message]) => ({ field, message })));
    // Built by the list-query builder from the checked selection: eq filters, escaped values, one page of max + 1.
    const page = await backend.query(actor, def.entity, list, { filters: selectionFilters(def, selection), page: 1, pageSize: max + 1 });
    if (page.total > max) throw new HttpError(400, `More than ${max.toLocaleString('en-US')} rows match this selection. Narrow your selection.`);
    return { selection, rows: page.rows };
  }

  return {
    read: async (actor: Actor, raw: unknown) => selected(actor, raw, await lookups(actor)),
    save: (actor: Actor, input: Record<string, unknown>): Promise<{ selection: Row; rows: Row[]; result: PlanResult }> => serial(`${id}|${backend.mode}`, async () => {
      if (!Array.isArray(input.rows)) throw new HttpError(400, 'Send the rows to save.');
      if (input.rows.length > max) throw new HttpError(400, `Save at most ${max} rows at a time.`);
      if ((input.rows as unknown[]).some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new HttpError(400, 'Send the rows to save.');
      // The rows as the browser read them (key + ETag): without them the conflict check below would be skipped.
      if (!Array.isArray(input.seen)) throw new HttpError(400, 'Refresh and try again.');
      const lk = await lookups(actor);
      // Plan against the selection as stored now, never against the browser's copy.
      const { selection, rows: stored } = await selected(actor, input.selection, lk);
      // Someone added, changed or deleted a row since Show: refuse, so no one's rows are overwritten or deleted unseen.
      // Updates and deletes then carry the ETag the person saw (it equals the stored one) as If-Match.
      if (staleSeen(def, stored, input.seen as unknown[])) throw new HttpError(409, CONFLICT_MESSAGE);
      const rows = (input.rows as unknown[]).map(r => cleanValues(def.grid, r));
      const problems = checkItems(def, rows, selection, lk);
      if (problems.length) throw new HttpError(422, 'Some rows need attention.', problems);
      const plan = planItems(def, stored, rows, selection);
      if (!plan.ops.length) return { selection, rows: stored, result: plan.result };
      await backend.apply(actor, def.entity, plan.ops);
      return { ...(await selected(actor, selection, lk)), result: plan.result };
    })
  };
}

/** GET /api/modules/:id/items?selection=<json> and POST /api/modules/:id/items { selection, seen, rows }. */
export async function itemsRequest(req: Request, cfg: AppConfig, id: string): Promise<Response> {
  const actor = actorOf(req);
  if (req.method === 'GET') {
    let selection: unknown;
    try { selection = JSON.parse(new URL(req.url).searchParams.get('selection') ?? '{}'); } catch { throw new HttpError(400, 'Give the selection as JSON.'); }
    return json(await itemsService(cfg, id).read(actor, selection));
  }
  assertTrustedWrite(req, cfg);
  return json(await itemsService(cfg, id).save(actor, await readJson(req, 4 * 1024 * 1024)));
}
