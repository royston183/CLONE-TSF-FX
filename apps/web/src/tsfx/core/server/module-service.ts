import type { Row, TabDef, View } from '@tsfx/lib/grid/types';
import type { AnyList, ListPage } from '@tsfx/lib/list/types';
import { HttpError } from '@tsfx/lib/errors';
import { isTableModule } from '@tsfx/modules/registry';
import { contractOf } from '@tsfx/modules/tables';
import { SERVER_MODULES, sourceOf, type ModuleData } from '@tsfx/modules/server-registry';
import type { AnyModuleDef, ODataContract } from '@tsfx/modules/types';
import type { Actor } from '../actor';
import { platform, type LayoutStore } from '../platform';
import type { Backend } from './backend';
import { galleryOn, type AppConfig } from './config';
import { parseListQuery } from './list-query';
import { cleanRow, MAX_ROWS, planChanges, type ChangeOp, type PlanResult } from '@tsfx/lib/planner';

export interface ChangedView extends View { result: PlanResult }

type CachedLookups = Map<string, { lookups: Record<string, Row[]>; expires: number }>;
const g = globalThis as {
  __moduleBackends?: Map<string, Backend>; __moduleLayouts?: Map<string, LayoutStore>; __moduleQueues?: Map<string, Promise<unknown>>;
  __backendLookups?: WeakMap<Backend, CachedLookups>;
};
// Per backend (so a local store and an SAP service never share an entry), then per acting user and module.
const lookupCache = (g.__backendLookups ??= new WeakMap<Backend, CachedLookups>());
const LOOKUP_TTL = 60_000;
const backends = (g.__moduleBackends ??= new Map<string, Backend>());
const layoutStores = (g.__moduleLayouts ??= new Map<string, LayoutStore>());
const queues = (g.__moduleQueues ??= new Map<string, Promise<unknown>>());

/** Forget every module's backend, layout store and queue (tests, and a new platform): sample data starts again. */
export function resetModuleBackends(): void { backends.clear(); layoutStores.clear(); queues.clear(); }

/** A registered module; Gallery samples (devOnly) only while the Gallery is enabled. */
export function moduleEntry(cfg: AppConfig, id: string): ModuleData {
  const entry = Object.hasOwn(SERVER_MODULES, id) ? SERVER_MODULES[id] : undefined;
  if (!entry || (entry.def.devOnly && !galleryOn(cfg))) throw new HttpError(404, 'Unknown application.');
  return entry;
}

/**
 * The module's backend, chosen by the platform from its source and kept per module, source and the platform's scope
 * (a module on sample data keeps its edits in memory until a reset). In the browser an SAP backend is kept per service
 * root and SAP client, so a changed SAP setting never reuses another service's connection state.
 */
export function backendFor(id: string, entry: ModuleData): Backend {
  const p = platform();
  const key = `${id}|${sourceOf(entry) ?? 'sample'}|${p.scope?.(entry) ?? ''}`;
  let backend = backends.get(key);
  if (!backend) {
    backend = p.backend(id, entry);
    backends.set(key, backend);
  }
  return backend;
}

/**
 * A module another one reads (a dashboard's ctx.rows and ctx.count, a report over it), with its backend: only when this
 * side keeps its data (platform.keeps), else the reader's own 422 (`refused`).
 */
export function moduleSide(cfg: AppConfig, id: string, refused: () => HttpError): { def: AnyModuleDef; backend: Backend } {
  const entry = moduleEntry(cfg, id);
  const keeps = platform().keeps;
  if (keeps && !keeps(entry)) throw refused();
  return { def: entry.def, backend: backendFor(id, entry) };
}

/**
 * A report over another module (`source`) runs where the report runs and reads that module there, so the module's data
 * must live on the same side (its source decides where the report runs, so it does unless called from elsewhere, e.g. a
 * dashboard on the other side). Any other combination fails with this message, as a dashboard's reads do (wrongSide).
 */
export function sourceWrongSide(reportId: string, moduleId: string): HttpError {
  return new HttpError(422, `Report ${reportId} cannot read module ${moduleId}. A report can read only modules whose data lives on the same side: SAP and sample-data modules in the browser, app modules in the BackEnd.`);
}

/**
 * The module a report over another module (`source`) reads, with its backend (rows and lookups) and contract; null for
 * any other module. Throws sourceWrongSide when that module's data does not live on this side.
 */
export function readSource(cfg: AppConfig, id: string, def: AnyModuleDef): { id: string; backend: Backend; contract: ODataContract } | null {
  const from = def.kind === 'report' ? def.source?.module : undefined;
  if (!from) return null;
  const { backend } = moduleSide(cfg, from, () => sourceWrongSide(id, from));
  return { id: from, backend, contract: contractOf(moduleEntry(cfg, from)) };
}

/** The module's layout store, chosen by the platform and kept like its backend. */
export function layoutStoreFor(id: string, entry: ModuleData): LayoutStore {
  const key = `${id}|${sourceOf(entry) ?? 'sample'}`;
  let store = layoutStores.get(key);
  if (!store) {
    store = platform().layouts(id, entry);
    layoutStores.set(key, store);
  }
  return store;
}

/**
 * A module's lookups, cached per backend, acting user and module for 60 s: paging and sorting a list, every report run
 * and breakdown, and every report a dashboard reads do not read them again.
 */
export async function cachedLookups(backend: Backend, actor: Actor, id: string): Promise<Record<string, Row[]>> {
  const cache = lookupCache.get(backend) ?? new Map();
  lookupCache.set(backend, cache);
  const key = `${actor.id}|${id}`, now = Date.now();
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  const hit = cache.get(key);
  if (hit) return hit.lookups;
  const lookups = await backend.lookups(actor);
  cache.set(key, { lookups, expires: now + LOOKUP_TTL });
  return lookups;
}

/** One change at a time per module, so two saves never plan against the same state. */
export function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

const OPS: Record<string, ChangeOp> = { POST: 'create', PATCH: 'update', DELETE: 'delete' };
export function opOf(method: string): ChangeOp {
  const op = OPS[method];
  if (!op) throw new HttpError(405, 'Method not allowed.');
  return op;
}

/** The list behind POST /api/modules/:id/:table/query: a large table-maintenance tab or an object module's list. */
function listOf(def: AnyModuleDef, table: string): AnyList | undefined {
  if (isTableModule(def)) { const tab = def.tabs.find(t => t.id === table); return tab?.large ? tab.list : undefined; }
  if (def.kind === 'object' && def.list.entity === table) return def.list;
  return undefined;
}

/** The keys of the rows a browser sent (cleaned, complete ones only): what a large tab is planned against. */
function sentKeys<L>(tab: TabDef<L>, rows: unknown): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_ROWS).map(r => cleanRow(tab, r)).filter(r => tab.keys.every(k => r[k])).map(r => Object.fromEntries(tab.keys.map(k => [k, r[k]])));
}

export function moduleService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  const { def } = entry;
  // A report over another module shows that module's data: its backend (lookups) and its service.
  const from = readSource(cfg, id, def);
  const backend = from?.backend ?? backendFor(id, entry);

  async function view(actor: Actor): Promise<View> {
    const service = backend.mode === 'odata' ? (from?.contract ?? contractOf(entry)).service : null;
    // Object, items and upload modules read their data per request; their view carries the lookups only.
    if (!isTableModule(def)) return { mode: backend.mode, service, tables: {}, lookups: await backend.lookups(actor) };
    const state = await backend.load(actor);
    const lk = def.lookups(state.lookups);
    const enrich = def.enrich;
    // A large tab is paged by its list; its table is never part of the view (a local store holds it whole).
    const tables = Object.fromEntries(Object.entries(state.tables)
      .filter(([t]) => !def.tabs.find(x => x.id === t)?.large)
      .map(([t, rows]) => [t, enrich ? rows.map(r => enrich(t, r, lk)) : rows]));
    return { mode: backend.mode, service, tables, lookups: state.lookups };
  }

  async function change(actor: Actor, table: string, op: ChangeOp, rows: unknown): Promise<ChangedView> {
    if (!isTableModule(def)) throw new HttpError(404, 'Unknown table.');
    const tab = def.tabs.find(t => t.id === table);
    if (!tab) throw new HttpError(404, 'Unknown table.');
    return serial(`${id}|${backend.mode}`, async () => {
      // Plan against what is stored now (with its ETags), never against what the browser holds.
      const state = await backend.load(actor);
      // A large table is never loaded whole: plan against the stored rows whose keys were sent.
      const current = tab.large ? await backend.readKeys(actor, table, sentKeys(tab, rows)) : state.tables[table] ?? [];
      const plan = planChanges(tab, op, rows, current, def.lookups(state.lookups));
      if (!plan.ok) throw new HttpError(422, 'Some rows need attention.', plan.errors);
      if (plan.ops.length) await backend.apply(actor, table, plan.ops);
      return { ...(await view(actor)), result: plan.result };
    });
  }

  /** Lookups cached per acting user and module for 60 s, so paging and sorting do not re-read them. */
  const lookupsOf = (actor: Actor) => cachedLookups(backend, actor, id);

  async function query(actor: Actor, table: string, raw: unknown): Promise<ListPage> {
    const list = listOf(def, table);
    if (!list) throw new HttpError(404, 'Unknown table.');
    const enrich = isTableModule(def) ? def.enrich : undefined;
    // Structure first (declared fields, operators, paging, digit and length limits), with no SAP call: a bad query is a 400.
    const first = parseListQuery(list, raw, def.lookups(undefined));
    // Lookups are read only when a filter value must be checked against options read from SAP, or rows are enriched.
    const dynamic = (first.filters ?? []).some(f => { const d = list.fields.find(x => x.field === f.field); return d && (typeof d.options === 'function' || d.lookup); });
    if (!dynamic && !enrich) return backend.query(actor, table, list, first);
    const lk = def.lookups(await lookupsOf(actor));
    const page = await backend.query(actor, table, list, dynamic ? parseListQuery(list, raw, lk) : first);
    return enrich ? { ...page, rows: page.rows.map(r => enrich(table, r, lk)) } : page;
  }

  const readKeys = (actor: Actor, table: string, keys: Row[]) => backend.readKeys(actor, table, keys);

  return { mode: backend.mode, view, change, query, readKeys };
}
