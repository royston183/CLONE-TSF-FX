// What the core needs from where it runs: the Node backend (BackEnd/src/platform-node.ts) or the browser
// (FrontEnd/src/lib/client/browser-platform.ts). The core itself uses web-standard APIs only.
import type { Row } from '@tsfx/lib/grid/types';
import type { ListPage, ListQuery } from '@tsfx/lib/list/types';
import type { SavedLayout } from '@tsfx/lib/report/types';
import type { ModuleData } from '@tsfx/modules/server-registry';
import type { Backend } from './server/backend';

export interface StoreState { tables: Record<string, Row[]>; lookups: Record<string, Row[]> }
/** A stored layout: the saved layout and, for a personal one, its owner (never sent to the browser). */
export interface StoredLayout extends SavedLayout { owner: string }
/** The ALV layouts of one module, replaced as a whole on save (one transaction where the store has them). */
export interface LayoutStore { load(): Promise<StoredLayout[]>; save(l: StoredLayout[]): Promise<void> }

export interface Platform {
  /** Environment variables (process.env on the server, the build settings in the browser). */
  env: () => Record<string, string | undefined>;
  /** Extra fetch options for SAP calls (the browser sends `credentials: 'omit'`: the relay keeps SAP's cookies). */
  sapFetchInit?: RequestInit;
  /**
   * Where one module's data is read and written, chosen by its source: `sap` (SAP through OData), `app` (the
   * application's own store) or none (its sample data, in memory). The core caches the answer per module, source and
   * scope. A platform that does not keep a module's data throws (the BackEnd: 404 for any module that is not `app`).
   */
  backend(id: string, entry: ModuleData): Backend;
  /**
   * Whether this platform keeps the module's data (`backend` answers it). Omitted: every module's. The BackEnd keeps
   * only `app` modules; the browser of an FE + BE + DB application keeps every module but the `app` ones.
   */
  keeps?(entry: ModuleData): boolean;
  /**
   * What else a module's backend depends on (the browser: a `sap` module's service root and the tab's SAP client), so a
   * changed SAP setting gets a new backend and never reuses another one's state or cached lookups.
   */
  scope?(entry: ModuleData): string;
  /** The ALV layouts of one module (cached by the core like `backend`; throws where they are not kept). */
  layouts(id: string, entry: ModuleData): LayoutStore;
  /**
   * Read-only access to modules this platform does not keep, for dashboards (ctx.rows, ctx.count, ctx.report): the browser
   * of an FE + BE + DB application reads the BackEnd's `app` and `rest` modules through its API. Omitted: such a read is
   * refused (wrongSide).
   */
  remote?: RemoteReads;
}
export interface RemoteReads {
  /** GET /api/modules/:id: the tables of a table module (read whole). */
  view(moduleId: string): Promise<{ tables?: Record<string, Row[]> }>;
  /** POST /api/modules/:id/:table/query: one page of a list (the list's own page sizes and filters). */
  query(moduleId: string, table: string, q: ListQuery): Promise<ListPage>;
  /** POST /api/modules/:id/report: a report's rows for a selection. */
  report(moduleId: string, selection: Row): Promise<Row[]>;
}

const g = globalThis as { __appPlatform?: Platform };

/** Called once at start-up by the runtime (server, browser, or a test setup file). */
export function setPlatform(p: Platform): void { g.__appPlatform = p; }

export function platform(): Platform {
  if (!g.__appPlatform) throw new Error('No platform is set: call setPlatform() at start-up.');
  return g.__appPlatform;
}
