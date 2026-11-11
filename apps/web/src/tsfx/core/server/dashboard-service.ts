import { dataKindOf, defaultRange, rangesOf, type Chip, type DashboardResult, type DashboardSection, type Range, type SectionData, type SectionResult } from '@tsfx/lib/dashboard/types';
import type { Row } from '@tsfx/lib/grid/types';
import { pageSizesOf, type AnyList, type ListFilter } from '@tsfx/lib/list/types';
import { checkReportSelection } from '@tsfx/lib/report/report';
import { HttpError } from '@tsfx/lib/errors';
import { isTableModule } from '@tsfx/modules/registry';
import type { AnyDashboardDef, AnyModuleDef } from '@tsfx/modules/types';
import type { AppConfig } from './config';
import type { DashboardContext } from './dashboard-types';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { applyQuery } from './list-query';
import { backendFor, cachedLookups, moduleEntry, moduleSide } from './module-service';
import { platform } from '../platform';
import { reportService } from './report-service';
import type { Actor } from '../actor';

/**
 * ctx.report runs the report where the dashboard runs. A dashboard in the BackEnd reads only the BackEnd's modules
 * (`app`, `rest`); one in the browser reads SAP and sample-data modules itself and the BackEnd's through its API
 * (Platform.remote). Any other combination fails with this message (a Front end only application keeps every report
 * in the page).
 */
export function wrongSide(dashboardId: string, reportId: string): HttpError {
  return new HttpError(422, `Dashboard ${dashboardId} cannot read report ${reportId}. A dashboard can read only reports whose data lives on the same side: SAP and sample-data reports in the browser, app reports in the BackEnd.`);
}

/** The list a module's table is paged by on SAP (an object's list, a large tab's), or null for a table read whole. */
function pagedList(def: AnyModuleDef, table: string): AnyList | null {
  if (def.kind === 'object') return def.list.entity === table ? def.list : null;
  if (isTableModule(def)) return def.tabs.find(t => t.id === table && t.large && t.list)?.list ?? null;
  return null;
}
/** A list with no typed fields: filters compare text, the order is SAP's (for rows held in memory). */
const plainList = (table: string): AnyList => ({ entity: table, keys: [], columns: [], fields: [], defaultSort: { field: '', dir: 1 } });

/** Dashboards (spec §6.2): the selection is checked, then every section loads on its own. Read-only. */
export function dashboardService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  if (entry.def.kind !== 'dashboard' || !entry.dashboard) throw new HttpError(404, 'Unknown application.');
  const def: AnyDashboardDef = entry.def;
  const server = entry.dashboard;
  // periodsOf's quarter loop never ends for a month outside 1–12: a broken definition fails here, not in a request.
  const quarterStartMonth = def.quarterStartMonth ?? 1;
  if (!Number.isInteger(quarterStartMonth) || quarterStartMonth < 1 || quarterStartMonth > 12) {
    throw new Error(`Dashboard ${id}: quarterStartMonth must be a whole month 1–12, not ${quarterStartMonth}.`);
  }
  const backend = backendFor(id, entry);
  /**
   * One context per request. ctx.report is memoised by module and selection: sections that read the same report and
   * period (the current month for tiles, trend, donut, table and chips) share one read, in flight or done.
   */
  const context = (actor: Actor): DashboardContext => {
    const reads = new Map<string, Promise<Row[]>>();
    const counts = new Map<string, Promise<number>>();
    /** A module whose data lives on this side (see wrongSide), with its backend. */
    const sideOf = (moduleId: string) => moduleSide(cfg, moduleId, () => wrongSide(id, moduleId));
    /** The platform's read of a module the other side keeps (the BackEnd's, from the browser), or null when it keeps it. */
    const remoteOf = (moduleId: string) => {
      const keeps = platform().keeps;
      return keeps && !keeps(moduleEntry(cfg, moduleId)) ? platform().remote ?? null : null;
    };
    /** Rows of a module the other side keeps: its list page by page (its largest page size), else its tables whole. */
    const remoteRows = async (moduleId: string, table: string, filters: ListFilter[], max: number): Promise<Row[]> => {
      const remote = remoteOf(moduleId);
      if (!remote) throw wrongSide(id, moduleId);
      const list = pagedList(moduleEntry(cfg, moduleId).def, table);
      if (!list) {
        const all = (await remote.view(moduleId)).tables?.[table];
        if (!all) throw new HttpError(404, `Module ${moduleId} has no table ${table}.`);
        return applyQuery(all, { filters, page: 1, pageSize: Math.max(1, all.length) }, plainList(table)).rows.slice(0, max);
      }
      const pageSize = Math.max(...pageSizesOf(list));
      const rows: Row[] = [];
      for (let page = 1; rows.length < max; page++) {
        const got = await remote.query(moduleId, table, { filters, page, pageSize });
        rows.push(...got.rows);
        if (got.rows.length < pageSize || rows.length >= got.total) break;
      }
      return rows.slice(0, max);
    };
    /** Rows of a table: SAP pages a list (at most `max`); any other table is read whole and filtered in memory. */
    const tableRows = async (moduleId: string, table: string, filters: ListFilter[], max: number): Promise<Row[]> => {
      if (remoteOf(moduleId)) return remoteRows(moduleId, table, filters, max);
      const { def: target, backend: b } = sideOf(moduleId);
      const list = pagedList(target, table);
      if (list) return (await b.query(actor, table, list, { filters, page: 1, pageSize: max })).rows;
      const all = (await b.load(actor)).tables[table];
      if (!all) throw new HttpError(404, `Module ${moduleId} has no table ${table}.`);
      return applyQuery(all, { filters, page: 1, pageSize: Math.max(1, all.length) }, plainList(table)).rows.slice(0, max);
    };
    return {
      actor, mode: backend.mode, quarterStartMonth,
      report(moduleId, selection) {
        const key = JSON.stringify([moduleId, Object.entries(selection).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);
        let read = reads.get(key);
        if (!read) {
          // Async, so an unknown module rejects like a failed read instead of throwing in the loader's call.
          read = (async () => {
            const keeps = platform().keeps;
            if (keeps && !keeps(moduleEntry(cfg, moduleId))) {
              const remote = platform().remote;
              if (!remote) throw wrongSide(id, moduleId);
              return remote.report(moduleId, selection);
            }
            return (await reportService(cfg, moduleId).run(actor, selection)).rows;
          })();
          reads.set(key, read);
        }
        return read;
      },
      rows(moduleId, table, filters = [], max = 5000) {
        const key = JSON.stringify(['rows', moduleId, table, filters, max]);
        let read = reads.get(key);
        if (!read) { read = tableRows(moduleId, table, filters, max); reads.set(key, read); }
        return read;
      },
      count(moduleId, table, filters = []) {
        const key = JSON.stringify([moduleId, table, filters]);
        let read = counts.get(key);
        if (!read) {
          read = (async () => {
            const remote = remoteOf(moduleId);
            const remoteList = remote ? pagedList(moduleEntry(cfg, moduleId).def, table) : null;
            if (remote && remoteList) return (await remote.query(moduleId, table, { filters, page: 1, pageSize: Math.min(...pageSizesOf(remoteList)) })).total;
            if (remote) return (await remoteRows(moduleId, table, filters, Number.MAX_SAFE_INTEGER)).length;
            const { def: target, backend: b } = sideOf(moduleId);
            const list = pagedList(target, table);
            // SAP counts a list ($count with one row); a table read whole is counted here.
            return list ? (await b.query(actor, table, list, { filters, page: 1, pageSize: 1 })).total : (await tableRows(moduleId, table, filters, Number.MAX_SAFE_INTEGER)).length;
          })();
          counts.set(key, read);
        }
        return read;
      }
    };
  };

  async function checked(actor: Actor, raw: unknown): Promise<Row> {
    const { selection, problems } = checkReportSelection(def, raw, def.lookups(await cachedLookups(backend, actor, id)));
    if (problems.length) throw new HttpError(400, problems[0].message, problems);
    return selection;
  }
  /** One section's data, refused when it is not the kind the section shows. */
  async function load(section: DashboardSection, selection: Row, ctx: DashboardContext, range: Range | null): Promise<SectionData> {
    const loader = Object.hasOwn(server.sections, section.id) ? server.sections[section.id] : undefined;
    if (!loader) throw new Error(`No loader for section ${section.id}.`);
    const data = await loader(selection, ctx, range);
    if (data?.kind !== dataKindOf(section)) throw new Error(`Section ${section.id} returned ${String(data?.kind)} data, not ${dataKindOf(section)}.`);
    return data;
  }
  const failed = (section: DashboardSection, error: unknown): SectionResult => {
    console.error(`Dashboard ${id}, section ${section.id}:`, error);
    const what = `Couldn't load ${section.title ?? 'the key figures'}`;
    // The app's own messages of a refused read say what to do ("Too many rows … Narrow the selection."); others stay generic.
    const told = error instanceof HttpError && (error.status < 500 || error.status === 502);
    return { error: told ? `${what}: ${error.message}` : `${what}.` };
  };

  return {
    async load(actor: Actor, raw: unknown): Promise<DashboardResult> {
      const selection = await checked(actor, raw);
      const ctx = context(actor);
      // Every section on its own: one that fails shows its error; the others still load.
      const settled = await Promise.allSettled(def.sections.map(s => load(s, selection, ctx, defaultRange(s))));
      const sections = Object.fromEntries(def.sections.map((s, i) => {
        const r = settled[i];
        return [s.id, r.status === 'fulfilled' ? { data: r.value } : failed(s, r.reason)];
      }));
      let chips: Chip[] | undefined;
      if (server.chips) {
        try { chips = await server.chips(selection, ctx); } catch (error) { console.error(`Dashboard ${id}, chips:`, error); }
      }
      return { sections, ...(chips ? { chips } : {}) };
    },
    /** One section again: a chart's range switch, or Retry of a section that failed. */
    async section(actor: Actor, input: Record<string, unknown>): Promise<SectionResult> {
      const selection = await checked(actor, input.selection);
      const section = def.sections.find(s => s.id === input.section);
      if (!section) throw new HttpError(404, 'Unknown section.');
      let range = defaultRange(section);
      if (input.range !== undefined && input.range !== null) {
        if (!rangesOf(section).includes(input.range as Range)) throw new HttpError(400, 'Unknown range.');
        range = input.range as Range;
      }
      try { return { data: await load(section, selection, context(actor), range) }; } catch (error) { return failed(section, error); }
    }
  };
}

/** POST /api/modules/:id/dashboard { selection } and POST /api/modules/:id/dashboard/range { selection, section, range? }. */
export async function dashboardRequest(req: Request, cfg: AppConfig, id: string, action: 'load' | 'section'): Promise<Response> {
  assertTrustedWrite(req, cfg);
  const actor = actorOf(req);
  const input = await readJson(req);
  const service = dashboardService(cfg, id);
  return json(action === 'load' ? await service.load(actor, input.selection) : await service.section(actor, input));
}
