// The one data client of the screens. Per module, by where its data lives:
//   `sap` (SAP through the relay) and modules still on sample data: the core's service runs in this page;
//   `app` (the application's own data): the BackEnd in an FE + BE + DB application, browser storage in a Front end only one;
//   `rest` (an external REST data service): the BackEnd, which calls it (FE + BE + DB only).
// Saved layouts follow the same rule (a module on sample data keeps them in memory). No call goes to the page's origin.
import { dashboardService } from '@tsfx/core/server/dashboard-service';
import { itemsService } from '@tsfx/core/server/items-service';
import { layoutService } from '@tsfx/core/server/layout-service';
import { moduleService, type ChangedView } from '@tsfx/core/server/module-service';
import { objectService } from '@tsfx/core/server/object-service';
import { reportService } from '@tsfx/core/server/report-service';
import { uploadService, type UploadCheck } from '@tsfx/core/server/upload-service';
import type { StoredObject } from '@tsfx/core/server/backend';
import type { DashboardResult, SectionResult } from '@tsfx/lib/dashboard/types';
import type { Row, View } from '@tsfx/lib/grid/types';
import type { ListPage } from '@tsfx/lib/list/types';
import type { PlanResult, ChangeOp } from '@tsfx/lib/planner';
import type { BreakdownResult, ReportResult, SavedLayout } from '@tsfx/lib/report/types';
import { HttpError } from '@tsfx/lib/errors';
import { SERVER_MODULES, keptByBackend, sourceOf } from '@tsfx/modules/server-registry';
import { APP_TYPE } from '@tsfx/runtime';
import { backendApi } from './backend-api';
import { browserActor, browserConfig } from './browser-platform';
import { currentAccount } from './sap-account';
import { cachedDashboard, clearDashboardCache } from './dashboard-cache';

/** The BackEnd answers this module's data: an `app` or `rest` module of an FE + BE + DB application. */
export const remote = (id: string): boolean => APP_TYPE === 'fullstack' && Object.hasOwn(SERVER_MODULES, id) && keptByBackend(sourceOf(SERVER_MODULES[id]));
/** The BackEnd keeps this module's saved layouts: any module with a source, in an FE + BE + DB application. */
export const remoteLayouts = (id: string): boolean => APP_TYPE === 'fullstack' && Object.hasOwn(SERVER_MODULES, id) && sourceOf(SERVER_MODULES[id]) !== undefined;

export const LOCAL_ERROR = 'Something went wrong. Try again.';
/**
 * Runs a branch in this page the way the BackEnd answers a request (errorResponse): an HttpError passes as it is, any
 * other error is logged and becomes a generic 500, so a screen never shows an internal message.
 */
export async function inPage<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(error);
    throw new HttpError(500, LOCAL_ERROR);
  }
}

const at = (id: string, ...rest: string[]) => `/modules/${[id, ...rest].map(encodeURIComponent).join('/')}`;
const json = (value: unknown) => encodeURIComponent(JSON.stringify(value));
const METHOD: Record<ChangeOp, string> = { create: 'POST', update: 'PATCH', delete: 'DELETE' };

type ObjectWhat = 'create' | 'update' | 'delete';
export type Body = Record<string, unknown>;
export interface ItemsAnswer { selection: Row; rows: Row[] }
export interface ItemsSaved extends ItemsAnswer { result: PlanResult }
export type ObjectAnswer = StoredObject & { unchanged?: true };
export interface UploadPosted { created: number; updated: number; invalid: number }
export interface Layouts { layouts: SavedLayout[] }

/** GET /api/modules/:id — a module's view (tables of a table module, the lookups of the others). */
export async function moduleView(id: string): Promise<View> {
  if (remote(id)) return backendApi<View>(at(id));
  return inPage(() => moduleService(browserConfig(), id).view(browserActor()));
}

/** POST / PATCH / DELETE /api/modules/:id/:table { rows } — a change of a table module's tab. */
export async function moduleChange(id: string, table: string, op: ChangeOp, rows: unknown): Promise<ChangedView> {
  clearDashboardCache();
  if (remote(id)) return backendApi<ChangedView>(at(id, table), { method: METHOD[op], body: { rows } });
  return inPage(() => moduleService(browserConfig(), id).change(browserActor(), table, op, rows));
}

/** POST /api/modules/:id/:table/query — one page of a large list. */
export async function moduleQuery(id: string, table: string, query: unknown, signal?: AbortSignal): Promise<ListPage> {
  if (remote(id)) return backendApi<ListPage>(at(id, table, 'query'), { method: 'POST', body: query, signal });
  return inPage(() => moduleService(browserConfig(), id).query(browserActor(), table, query));
}

/** GET /api/modules/:id/items?selection= — the rows of one selection. */
export async function itemsRead(id: string, selection: unknown): Promise<ItemsAnswer> {
  if (remote(id)) return backendApi<ItemsAnswer>(`${at(id, 'items')}?selection=${json(selection)}`);
  return inPage(() => itemsService(browserConfig(), id).read(browserActor(), selection));
}

/** POST /api/modules/:id/items { selection, seen, rows }. */
export async function itemsSave(id: string, body: Body): Promise<ItemsSaved> {
  if (remote(id)) return backendApi<ItemsSaved>(at(id, 'items'), { method: 'POST', body });
  return inPage(() => itemsService(browserConfig(), id).save(browserActor(), body));
}

/** GET /api/modules/:id/object?key= — one object with its items. */
export async function objectRead(id: string, key: unknown): Promise<StoredObject> {
  if (remote(id)) return backendApi<StoredObject>(`${at(id, 'object')}?key=${json(key)}`);
  return inPage(() => objectService(browserConfig(), id).read(browserActor(), key));
}

/** POST (create), PATCH (update) and DELETE /api/modules/:id/object. */
export async function objectWrite(id: string, what: 'delete', body: Body): Promise<{ deleted: true }>;
export async function objectWrite(id: string, what: 'create' | 'update', body: Body): Promise<ObjectAnswer>;
export async function objectWrite(id: string, what: ObjectWhat, body: Body): Promise<ObjectAnswer | { deleted: true }> {
  clearDashboardCache();
  if (remote(id)) return backendApi(at(id, 'object'), { method: what === 'create' ? 'POST' : what === 'update' ? 'PATCH' : 'DELETE', body });
  return inPage<ObjectAnswer | { deleted: true }>(() => {
    const svc = objectService(browserConfig(), id);
    const actor = browserActor();
    if (what === 'create') return svc.create(actor, body);
    if (what === 'update') return svc.update(actor, body);
    return svc.remove(actor, body);
  });
}

/** POST /api/modules/:id/object/action/:action { key, etag }. */
export async function objectAction(id: string, action: string, body: Body): Promise<StoredObject> {
  clearDashboardCache();
  if (remote(id)) return backendApi<StoredObject>(at(id, 'object', 'action', action), { method: 'POST', body });
  return inPage(() => objectService(browserConfig(), id).action(browserActor(), action, body));
}

/** POST /api/modules/:id/upload/check { rows }. */
export async function uploadCheck(id: string, body: Body): Promise<UploadCheck> {
  if (remote(id)) return backendApi<UploadCheck>(at(id, 'upload', 'check'), { method: 'POST', body });
  return inPage(() => uploadService(browserConfig(), id).check(browserActor(), body));
}

/** POST /api/modules/:id/upload/post { rows }. */
export async function uploadPost(id: string, body: Body): Promise<UploadPosted> {
  if (remote(id)) return backendApi<UploadPosted>(at(id, 'upload', 'post'), { method: 'POST', body });
  return inPage(() => uploadService(browserConfig(), id).post(browserActor(), body));
}

/** POST /api/modules/:id/report { selection }. */
export async function reportRun(id: string, body: { selection: unknown }, signal?: AbortSignal): Promise<ReportResult> {
  if (remote(id)) return backendApi<ReportResult>(at(id, 'report'), { method: 'POST', body, signal });
  return inPage(() => reportService(browserConfig(), id).run(browserActor(), body.selection));
}

/** POST /api/modules/:id/report/breakdown { selection, rowId, column }. */
export async function reportBreakdown(id: string, body: Body, signal?: AbortSignal): Promise<BreakdownResult> {
  if (remote(id)) return backendApi<BreakdownResult>(at(id, 'report', 'breakdown'), { method: 'POST', body, signal });
  return inPage(() => reportService(browserConfig(), id).breakdown(browserActor(), body));
}

/** POST /api/modules/:id/dashboard { selection }. */
export async function dashboardLoad(id: string, body: { selection: unknown }, signal?: AbortSignal): Promise<DashboardResult> {
  if (id === 'fx-overview') {
    const account = currentAccount();
    const key = JSON.stringify([id, browserActor().id, account.username, account.client, body.selection]);
    return cachedDashboard(key, () => inPage(() => dashboardService(browserConfig(), id).load(browserActor(), body.selection)));
  }
  if (remote(id)) return backendApi<DashboardResult>(at(id, 'dashboard'), { method: 'POST', body, signal });
  return inPage(() => dashboardService(browserConfig(), id).load(browserActor(), body.selection));
}

/** POST /api/modules/:id/dashboard/range { selection, section, range? }. */
export async function dashboardSection(id: string, body: Body, signal?: AbortSignal): Promise<SectionResult> {
  if (remote(id)) return backendApi<SectionResult>(at(id, 'dashboard', 'range'), { method: 'POST', body, signal });
  return inPage(() => dashboardService(browserConfig(), id).section(browserActor(), body));
}

/** GET /api/modules/:id/layouts — the shared layouts and the acting user's own. */
export async function layoutsList(id: string): Promise<Layouts> {
  if (remoteLayouts(id)) return backendApi<Layouts>(at(id, 'layouts'));
  return inPage(() => layoutService(browserConfig(), id).list(browserActor()));
}

/** PUT /api/modules/:id/layouts { name, description, scope, isDefault, layout }. */
export async function layoutsSave(id: string, body: Body): Promise<Layouts> {
  if (remoteLayouts(id)) return backendApi<Layouts>(at(id, 'layouts'), { method: 'PUT', body });
  return inPage(() => layoutService(browserConfig(), id).save(browserActor(), body));
}

/** DELETE /api/modules/:id/layouts?name=&scope=. */
export async function layoutsRemove(id: string, name: string, scope: string): Promise<Layouts> {
  if (remoteLayouts(id)) return backendApi<Layouts>(`${at(id, 'layouts')}?${new URLSearchParams({ name, scope })}`, { method: 'DELETE' });
  return inPage(() => layoutService(browserConfig(), id).remove(browserActor(), name, scope));
}

/** The module still runs on the sample data in its definition (no data source yet; kept in this page's memory). */
export const onSampleData = (id: string): boolean => !(Object.hasOwn(SERVER_MODULES, id) && sourceOf(SERVER_MODULES[id]));
export const SAMPLE_DATA_NOTE = 'Running on sample data: this application has no data source yet, so changes last until the page is reloaded.';
/** Where a module's data lives, by its `source`, for Settings → Service mappings (a module not registered: sample data). */
export function sourceStatus(id: string | undefined): { label: string; sap: boolean } {
  const source = id && Object.hasOwn(SERVER_MODULES, id) ? sourceOf(SERVER_MODULES[id]) : undefined;
  if (source === 'sap') return { label: 'SAP OData through the relay', sap: true };
  if (source === 'app') return { label: "The application's own data", sap: false };
  if (source === 'rest') return { label: 'REST data service, through the BackEnd', sap: false };
  return { label: 'Sample data', sap: false };
}
/** Where a module's view came from, for its pill: SAP's service, its sample data or the application's own data. */
export const sourceLabel = (id: string, view: Pick<View, 'mode' | 'service'>): string =>
  (view.mode === 'odata' ? `SAP OData · ${view.service}` : onSampleData(id) ? 'Sample data' : 'Application data');
