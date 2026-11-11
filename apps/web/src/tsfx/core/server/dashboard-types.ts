import type { Chip, Range, SectionData } from '@tsfx/lib/dashboard/types';
import type { Row } from '@tsfx/lib/grid/types';
import type { ListFilter } from '@tsfx/lib/list/types';
import type { Actor } from '../actor';

/** What a dashboard's server part may use (spec §6.1). */
export interface DashboardContext {
  actor: Actor;
  mode: 'odata' | 'local';
  /** First month of a quarter (1–12), from the definition. */
  quarterStartMonth: number;
  /**
   * The rows of a registered report module for a selection: same checks, row cap and backend (SAP or mock) as POST
   * /report. Read once per request and selection (sections share the answer): do not change the rows.
   */
  report(moduleId: string, selection: Row): Promise<Row[]>;
  /**
   * How many rows a module's table has with these filters: for an object list or a large table SAP counts them
   * ($count, one row read); for any other table the rows are read and counted. Same backend (SAP or sample data).
   */
  count(moduleId: string, table: string, filters?: ListFilter[]): Promise<number>;
  /**
   * A module's table rows with these filters (eq / in / contains / between, as a list filters them): an object list or a
   * large table through SAP's paging (at most `max`, default 5,000), any other table read whole and filtered here.
   * Read once per request; do not change the rows.
   */
  rows(moduleId: string, table: string, filters?: ListFilter[], max?: number): Promise<Row[]>;
}
/** Loads one section; `range` is the chart's range (null for sections without ranges). */
export type SectionLoader = (selection: Row, ctx: DashboardContext, range: Range | null) => Promise<SectionData>;
/** `dashboard.server.ts` of a dashboard module: one loader per section id, and optional status chips. */
export interface DashboardServer {
  sections: Record<string, SectionLoader>;
  chips?: (selection: Row, ctx: DashboardContext) => Promise<Chip[]>;
}
