// Dashboards (spec §6): sections, their data and results. Shared by browser and server; values are strings.
import type { IconName } from '@tsfx/config/catalog';
import type { DrillTarget, LinkTarget, RowStyle } from '@tsfx/lib/report/types';

/** Trend range; quarters follow the definition's quarterStartMonth. */
export type Range = '3m' | '6m' | '12m' | '4q';
export const RANGES: { id: Range; label: string }[] = [
  { id: '3m', label: '3 months' }, { id: '6m', label: '6 months' }, { id: '12m', label: '12 months' }, { id: '4q', label: 'Last 4 quarters' }
];
export const DEFAULT_RANGES: Range[] = ['3m', '6m', '12m', '4q'];

/**
 * The sections of a dashboard, in the order they show (an Overview groups them: entity cards, KPI tiles, the flow,
 * the chart cards two by two, then tables). `sub` is the line under a card's title; the amount unit is added to it.
 */
export type DashboardSection = { sub?: string } & (
  | { kind: 'tiles'; id: string; title?: string }
  | { kind: 'entities'; id: string; title?: string }
  | { kind: 'bars'; id: string; title: string; ranges?: Range[] }
  | { kind: 'line'; id: string; title: string; ranges?: Range[] }
  | { kind: 'donut'; id: string; title: string; measures?: { id: string; label: string }[] }
  | { kind: 'barList'; id: string; title: string }
  | { kind: 'share'; id: string; title: string }
  | { kind: 'flow'; id: string; title: string }
  | { kind: 'table'; id: string; title: string });

export type Rag = 'green' | 'amber' | 'red';
export interface Tile {
  label: string;
  value: string;
  /** `ratio`: a multiple such as a coverage, shown as "1.87×". */
  type: 'amount' | 'percent' | 'count' | 'ratio';
  currency?: string;
  /**
   * A limit meter: `value` is measured against `limit`, both with the same sign (a mismatch % and its −10.00 % limit, or
   * an exposure and its positive limit). The share of the limit used is value / limit, 0 when the signs differ.
   */
  meter?: { value: string; limit: string };
  /** A traffic light. With a `meter` it reads as a limit (Within limit / Near limit / Breach), without one as On track / Attention / Action needed. */
  rag?: Rag;
  /** A free-wording tag with a tone; shown instead of the rag label. */
  tag?: { label: string; tone: Rag };
  /** `good`: which direction of the value is good (green). */
  delta?: { value: string; good: 'up' | 'down' };
  info?: string;
  drill?: DrillTarget;
  /** The icon at the card's top right (a catalogue icon name). */
  icon?: IconName;
  /** The line under the value and its unit, e.g. "Principal plus accrued interest · 69.4% of the sanctioned limit". */
  note?: string;
}
/** One entity card (a company code): its amount and share of all, and a row of figures under it. */
export interface Entity {
  code: string;
  name: string;
  /** An amount in the dashboard's currency (shown in the chosen unit). */
  amount: string;
  /** What the amount is, e.g. "Outstanding". */
  label?: string;
  stats: { label: string; value: string }[];
  drill?: DrillTarget;
}
/** One bar of a bar list: label, a note under it (e.g. "84 accounts") and an amount; the share is worked out. */
export interface BarItem { label: string; note?: string; value: string; drill?: DrillTarget }
/** One part of a 100 % bar: share of the total, amount and a count. `tone` picks its colour (default by position). */
export interface SharePart { label: string; value: string; count?: string; tone?: 'green' | 'blue' | 'amber' | 'orange' | 'red' | 'grey' }
/** A flow (process) chart: a top box over one column per step, each with its open items. */
export interface FlowBox { label: string; title: string; note?: string; amount?: string; drill?: DrillTarget }
export interface FlowItem { name: string; tag?: string; amount?: string; badge?: string; drill?: DrillTarget }
export interface FlowStep extends FlowBox { tone?: 'blue' | 'amber' | 'green' | 'red'; items: FlowItem[] }
export interface Series { name: string; points: { x: string; y: string; status?: 'amber' | 'red' }[]; limit?: string }
/** A donut slice; with measures (the donut's toggle) `values` holds the slice per measure id. */
export interface Slice { label: string; value: string; values?: Record<string, string> }
/** How a summary column shows its values: amounts in the unit (default), counts, percents or text; `accent` colours it. */
export type ColumnFormat = 'amount' | 'count' | 'percent' | 'text';
export interface TableData {
  columns: { id: string; label: string; format?: ColumnFormat; accent?: boolean }[];
  /** `open`: the row's label opens this target (a button), when it resolves in the catalogue. */
  rows: { label: string; sub?: string; style?: RowStyle; cells: Record<string, string>; open?: DrillTarget }[];
  drill?: Record<string, { lines: { label: string; amount: string }[]; target?: DrillTarget }>;
  /** Heading of the first column (default: the unit). */
  rowHeader?: string;
  /** The note under the table. */
  footnote?: string;
  /** A link to the full list or report, at the card's top right. */
  explore?: LinkTarget;
}

export type SectionData =
  | { kind: 'tiles'; tiles: Tile[] }
  | { kind: 'series'; series: Series[]; format: 'amount' | 'percent'; currency?: string; range?: Range }
  | { kind: 'slices'; slices: Slice[]; currency?: string }
  | { kind: 'entities'; entities: Entity[]; currency?: string }
  | { kind: 'items'; items: BarItem[]; currency?: string }
  | { kind: 'shares'; parts: SharePart[]; currency?: string }
  | { kind: 'steps'; root: FlowBox; steps: FlowStep[]; currency?: string }
  | ({ kind: 'table'; currency?: string } & TableData);
export type SectionResult = { data: SectionData } | { error: string };
export interface Chip { label: string; tone?: 'saved' | 'locked' | 'off' }
/** POST /api/modules/:id/dashboard. */
export interface DashboardResult { sections: Record<string, SectionResult>; chips?: Chip[] }

export const rangesOf = (s: DashboardSection): Range[] => (s.kind === 'bars' || s.kind === 'line' ? s.ranges ?? DEFAULT_RANGES : []);
/** The range a section opens with: 6 months when offered, else its first range; null without ranges. */
export function defaultRange(s: DashboardSection): Range | null {
  const r = rangesOf(s);
  return r.includes('6m') ? '6m' : r[0] ?? null;
}
const DATA_KIND: Record<DashboardSection['kind'], SectionData['kind']> = {
  tiles: 'tiles', entities: 'entities', bars: 'series', line: 'series', donut: 'slices', barList: 'items', share: 'shares', flow: 'steps', table: 'table'
};
/** The kind of data a section expects from its loader. */
export const dataKindOf = (s: DashboardSection): SectionData['kind'] => DATA_KIND[s.kind];
/** Sections drawn as chart cards (two to a row on an Overview). */
export const CHART_KINDS: DashboardSection['kind'][] = ['bars', 'line', 'donut', 'barList', 'share'];
