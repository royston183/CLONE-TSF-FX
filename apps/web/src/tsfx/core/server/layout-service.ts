import { checkLayoutInput, listLayoutTarget, reportLayoutTarget, type LayoutTarget } from '@tsfx/lib/layout/layout';
import type { LayoutScope, SavedLayout } from '@tsfx/lib/report/types';
import { unitsOf } from '@tsfx/lib/report/units';
import { HttpError } from '@tsfx/lib/errors';
import type { AnyModuleDef } from '@tsfx/modules/types';
import type { Actor } from '../actor';
import type { StoredLayout } from '../platform';
import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { layoutStoreFor, moduleEntry, serial } from './module-service';

/** The person a personal layout belongs to: the acting user. */
export const ownerOf = (actor: Actor): string => actor.username.toUpperCase();

/** What a module's layouts may contain and who may change shared ones; null when it has no layouts. */
export function layoutTargetOf(def: AnyModuleDef): { target: LayoutTarget; editors?: string[] } | null {
  if (def.kind === 'report' && def.report.variant === 'lineItems' && def.report.layouts) {
    return { target: reportLayoutTarget(def.report.columns, def.report.standard, def.report.layouts, unitsOf(def.units).map(u => u.id)), editors: def.report.layouts.sharedEditors };
  }
  if (def.kind === 'object' && def.list.layouts) return { target: listLayoutTarget(def.list), editors: def.list.layouts.sharedEditors };
  return null;
}

const OWNERS_ONLY = 'Only the report owners may save or delete shared layouts.';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (l: StoredLayout): SavedLayout => ({ name: l.name, description: l.description, scope: l.scope, isDefault: l.isDefault, layout: l.layout, changedBy: l.changedBy, changedOn: l.changedOn });

/**
 * ALV layouts of one module (spec §4.3): shared ones and each user's own. Kept by the platform (table `layouts` of the
 * database, or browser storage) once the module has a data source; in memory while it runs on sample data.
 */
export function layoutService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  const found = layoutTargetOf(entry.def);
  if (!found) throw new HttpError(404, 'This application has no layouts.');
  const { target, editors } = found;
  const layoutStore = layoutStoreFor(id, entry);

  async function load(): Promise<StoredLayout[]> {
    try {
      return await layoutStore.load();
    } catch {
      throw new HttpError(500, `The layouts of ${id} are unreadable. Delete them to start again.`);
    }
  }
  // The store replaces a module's layouts at once (one transaction): a crash never leaves half a store behind.
  const store = (layouts: StoredLayout[]): Promise<void> => layoutStore.save(layouts);
  /** Shared layouts first, then the user's own; never someone else's personal layouts. */
  const visible = (layouts: StoredLayout[], me: string) => ({
    layouts: [...layouts.filter(l => l.scope === 'shared'), ...layouts.filter(l => l.scope === 'personal' && l.owner === me)].map(shown)
  });
  const mine = (l: StoredLayout, scope: LayoutScope, me: string) => l.scope === scope && (scope === 'shared' || l.owner === me);
  const mayShare = (me: string) => !editors || editors.some(e => e.toUpperCase() === me);

  return {
    list: async (actor: Actor) => visible(await load(), ownerOf(actor)),
    save: (actor: Actor, raw: unknown) => serial(`layouts|${id}`, async () => {
      const me = ownerOf(actor);
      const input = checkLayoutInput(raw, target);
      if (input.scope === 'shared' && !mayShare(me)) throw new HttpError(403, OWNERS_ONLY);
      const layouts = await load();
      const entry: StoredLayout = { ...input, owner: input.scope === 'shared' ? '' : me, changedBy: me, changedOn: new Date().toISOString() };
      const at = layouts.findIndex(l => mine(l, input.scope, me) && same(l.name, input.name));
      let next = at >= 0 ? layouts.map((l, i) => (i === at ? entry : l)) : [...layouts, entry];
      // A new default clears the previous default of the same scope (and owner).
      if (entry.isDefault) next = next.map(l => (l !== entry && l.isDefault && mine(l, entry.scope, me) ? { ...l, isDefault: false } : l));
      await store(next);
      return visible(next, me);
    }),
    remove: (actor: Actor, name: string, scope: string) => serial(`layouts|${id}`, async () => {
      if (scope !== 'shared' && scope !== 'personal') throw new HttpError(400, 'Choose shared or personal.');
      const me = ownerOf(actor);
      if (scope === 'shared' && !mayShare(me)) throw new HttpError(403, OWNERS_ONLY);
      const layouts = await load();
      const next = layouts.filter(l => !(mine(l, scope, me) && same(l.name, name.trim())));
      if (next.length === layouts.length) throw new HttpError(404, `Layout '${name}' does not exist.`);
      await store(next);
      return visible(next, me);
    })
  };
}

/** GET (list), PUT (save) and DELETE ?name=&scope= of /api/modules/:id/layouts. */
export async function layoutsRequest(req: Request, cfg: AppConfig, id: string): Promise<Response> {
  const actor = actorOf(req);
  const service = layoutService(cfg, id);
  if (req.method === 'GET') return json(await service.list(actor));
  assertTrustedWrite(req, cfg);
  if (req.method === 'PUT') return json(await service.save(actor, await readJson(req)));
  if (req.method === 'DELETE') {
    const q = new URL(req.url).searchParams;
    return json(await service.remove(actor, q.get('name') ?? '', q.get('scope') ?? ''));
  }
  throw new HttpError(405, 'Method not allowed.');
}
