import type { Row } from '@tsfx/lib/grid/types';
import { checkReportSelection, childrenOf, maxRowsOf, reportFilters, reportList, selectionText, tooManyRows } from '@tsfx/lib/report/report';
import type { BreakdownResult, ReportResult } from '@tsfx/lib/report/types';
import { HttpError } from '@tsfx/lib/errors';
import { SERVER_MODULES } from '@tsfx/modules/server-registry';
import { reportSourceProblem } from '@tsfx/modules/tables';
import type { AnyReportDef } from '@tsfx/modules/types';
import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { backendFor, cachedLookups, moduleEntry, readSource } from './module-service';
import type { Actor } from '../actor';

/**
 * Reports (spec §3.2): the selection is checked first; then the entity is read once, capped, in SAP's order. Read-only.
 * A report over another module (`source`) reads that module's header rows and lookups through that module's backend
 * (its own `lookups` maps them); on the other side it is 422 (sourceWrongSide).
 */
export function reportService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  if (entry.def.kind !== 'report') throw new HttpError(404, 'Unknown application.');
  const def: AnyReportDef = entry.def;
  const source = def.source?.module;
  if (source) {
    // A broken definition fails here, not with a wrong read (the definitions test runs the same check).
    const problem = reportSourceProblem(def, Object.hasOwn(SERVER_MODULES, source) ? SERVER_MODULES[source].def : undefined);
    if (problem) throw new Error(`Report ${id}: ${problem}`);
  }
  const own = source ? null : backendFor(id, entry);
  const list = reportList(def);
  const max = maxRowsOf(def);
  /** Where rows and lookups are read: the report's own backend, or its source module's (checked per read: 422 off side). */
  const data = () => (own ? { backend: own, id } : readSource(cfg, id, def)!);

  async function read(actor: Actor, raw: unknown): Promise<{ selection: Row; rows: Row[]; lk: unknown }> {
    // The 60 s lookups cache of module lists: a run, each breakdown and each read of a dashboard do not re-read them.
    const from = data();
    const lk = def.lookups(await cachedLookups(from.backend, actor, from.id));
    const { selection, problems } = checkReportSelection(def, raw, lk);
    // Nothing of the report is read from SAP before the selection is valid.
    if (problems.length) throw new HttpError(400, problems[0].message, problems);
    // max + 1 rows through the list-query builder (eq filters, escaped values; a local store applies the same query).
    // backend.query directly, never parseListQuery/pageSizesOf: they would cap the page size (500) and break the row cap.
    const page = await from.backend.query(actor, def.report.entity, list, { filters: reportFilters(def, selection), page: 1, pageSize: max + 1 });
    // More than max: refused, never shown cut off.
    if (page.total > max || page.rows.length > max) throw new HttpError(422, tooManyRows(max));
    // Fewer rows than SAP counted (a short read): refused, never shown as complete.
    if (page.rows.length < page.total) throw new HttpError(502, 'SAP returned fewer rows than it counted. Try again or narrow the selection.');
    return { selection, rows: page.rows, lk };
  }

  return {
    async run(actor: Actor, raw: unknown): Promise<ReportResult> {
      const { selection, rows, lk } = await read(actor, raw);
      return { rows, columns: def.report.columns, meta: { selection, selectionText: selectionText(def.selection, selection, lk), readAt: new Date().toISOString(), total: rows.length } };
    },
    /** The children of one row, from a fresh read of the selection (the browser never sends rows). */
    async breakdown(actor: Actor, input: Record<string, unknown>): Promise<BreakdownResult> {
      const report = def.report;
      if (report.variant !== 'formatted') throw new HttpError(404, 'This report has no breakdown.');
      const rowId = typeof input.rowId === 'string' ? input.rowId : '';
      if (!rowId || rowId.length > 200) throw new HttpError(400, 'Give the row to break down.');
      const column = input.column ?? null;
      if (column !== null && (typeof column !== 'string' || !report.columns.some(c => c.id === column))) throw new HttpError(400, `Unknown column ${String(column)}.`);
      const { rows } = await read(actor, input.selection);
      const row = rows.find(r => r[report.idField] === rowId);
      if (!row) throw new HttpError(404, 'This row is no longer in the report.');
      return { row, rows: childrenOf(report, rows, rowId) };
    }
  };
}

/** POST /api/modules/:id/report { selection } and POST /api/modules/:id/report/breakdown { selection, rowId, column }. */
export async function reportRequest(req: Request, cfg: AppConfig, id: string, action: 'run' | 'breakdown'): Promise<Response> {
  // POST so the selection travels as JSON (not in URLs or logs) and the same-origin guard applies; nothing is written.
  assertTrustedWrite(req, cfg);
  const actor = actorOf(req);
  const input = await readJson(req);
  const service = reportService(cfg, id);
  return json(action === 'run' ? await service.run(actor, input.selection) : await service.breakdown(actor, input));
}
