import type { ComponentType } from 'react';
import type { FieldDef } from '@tsfx/lib/fields/types';
import type { Column, Row, StampFields, TabDef } from '@tsfx/lib/grid/types';
import type { ListDef } from '@tsfx/lib/list/types';
import type { DashboardSection } from '@tsfx/lib/dashboard/types';
import type { DrillTarget, ReportDef, Unit } from '@tsfx/lib/report/types';

/** What every module kind shares. */
interface ModuleBase<L> {
  id: string;
  title: string;
  /** Key of the SAP service in src/config/services.json (Gallery samples use 'samples', which has no URL in the app). */
  serviceKey: string;
  /** localStorage key (open tab, last selection). */
  storageKey: string;
  /** Gallery sample: hidden from the rail and catalogue, refused by the API unless the Gallery is enabled. */
  devOnly?: boolean;
  /** A helper no catalogue entry opens (a report read only by a custom page or a dashboard): exempt from the catalogue rule. */
  internal?: boolean;
  lookups: (raw: Record<string, Row[]> | undefined) => L;
}

/** How a record opens: on its own page, in a pop-up, or as ordered wizard steps (chosen per module from its data). */
export type OpenMode = 'page' | 'popup' | 'wizard';
export interface Opens { create: OpenMode; open: OpenMode }

/** A table-maintenance application (kind 'table', the default): shared by the Workbench and the change planner. */
export interface ModuleDef<L> extends ModuleBase<L> {
  kind?: 'table';
  /** How adding and opening a record shows. */
  opens: Opens;
  /** Plural noun used in messages, e.g. "time buckets". */
  noun: string;
  /** Empty rows offered by the Add grid. */
  blankRows: number;
  /** Save nothing while any filled row is invalid (as the legacy SAP screen did). */
  strict: boolean;
  tabs: TabDef<L>[];
  /** Every application field per table, as read from SAP: keys, data and stamps. */
  fields: Record<string, string[]>;
  stamps?: StampFields;
  /** Display-only fields added to each row on the server (e.g. texts for codes). */
  enrich?: (table: string, row: Row, lk: L) => Row;
}
export type TableModuleDef<L> = ModuleDef<L>;

export type ObjectMode = 'display' | 'edit' | 'create';
/** Props of a custom object tab (the escape hatch when fields and items do not fit). */
export interface ObjectTabProps { header: Row; items: Record<string, Row[]>; lk: unknown; mode: ObjectMode; onHeader: (field: string, value: string) => void }
export interface FieldGroupDef<L> { title: string; columns?: 1 | 2; fields: FieldDef<L>[] }
export type ObjectTab<L> =
  | { kind: 'fields'; id: string; label: string; groups: FieldGroupDef<L>[] }
  /** `keys`: the header keys, then the item's own keys (['deal', 'seq']). */
  /**
   * `keyBySap`: SAP assigns the item's own keys on create (early numbering). A new row leaves them empty; each such row is
   * its own create, and the empty key fields are not sent.
   */
  | { kind: 'items'; id: string; label: string; table: string; keys: string[]; grid: FieldDef<L>[]; columns: Column[]; editable?: boolean; keyBySap?: boolean }
  | { kind: 'custom'; id: string; label: string; component: ComponentType<ObjectTabProps> };
export type ItemsTab<L> = Extract<ObjectTab<L>, { kind: 'items' }>;
export interface ObjectAction {
  id: string;
  label: string;
  /** Qualified name of the bound action (contract.object.actions may override it per system). */
  sapAction: string;
  confirm: string;
  danger?: boolean;
  when?: (header: Row) => boolean;
  /** Fields the person fills before the action runs (a form in place of the question, checked like any field). */
  inputs?: FieldDef[];
  /** Rules on the inputs against the stored header (field → message), in the input form and again on the server (422). */
  check?: (header: Row, values: Row) => Record<string, string>;
  /**
   * On its own or with `apply`, where `apply` runs (app data, or sample data without a mock; never SAP): the items tabs the action replaces (tab id → every row the tab holds afterwards), e.g. a history row
   * added. Saved with the header change in one write (cleaned by the tab's grid fields), also to an items tab that is
   * not editable; ids that are not items tabs are ignored.
   */
  applyItems?: (header: Row, items: Record<string, Row[]>, values: Row, user: string) => Record<string, Row[]>;
  /**
   * The application's own data (source 'app'): the changed header fields, from the stored header and the inputs' values.
   * Pure; saved like an edit (same checks and ETag; 422 when it leaves the record invalid). SAP runs its own action.
   */
  apply?: (header: Row, values: Row) => Row;
  /** How sample data applies the action (also the application's own data without `apply`); SAP runs its own. */
  mock?: (header: Row, values: Row) => Row;
}
export interface ItemProblem { row: number; field: string; message: string }
export interface ObjectProblems { header: Record<string, string>; items: Record<string, ItemProblem[]>; messages: string[] }

/** One business object with its items: list → pop-up (spec §4). */
export interface ObjectModuleDef<L> extends ModuleBase<L> {
  kind: 'object';
  /** How adding and opening a record shows. */
  opens: Opens;
  /** True skips that wizard step (ids: 'head' and the tab ids) given the header answers. */
  wizardSkip?: (stepId: string, header: Row) => boolean;
  noun: [singular: string, plural: string];
  list: ListDef<L>;
  /** The record's key facts under its title; also the edit form's first group. A field with statusTone is its status tag. */
  header: FieldDef<L>[];
  /** The line under the record's title (default: the module's title), e.g. the customer and the loan account. */
  subtitle?: (header: Row, lk: L) => string;
  tabs: ObjectTab<L>[];
  /** SAP assigns the key on create (the key field is hidden in create mode). */
  keyBySap?: boolean;
  defaults?: (lk: L) => Row;
  /**
   * Stored header fields the server sets on create, over what was typed (e.g. a Draft status changed by actions). The
   * create form leaves them out, and the checks see them set (a required one is never missing).
   */
  initial?: () => Row;
  check?: (header: Row, items: Record<string, Row[]>, lk: L, mode: 'create' | 'edit') => ObjectProblems;
  actions?: ObjectAction[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Per record, from its stored header: false hides Edit and the server refuses the update (e.g. a released record). */
  editableWhen?: (header: Row) => boolean;
  /**
   * Per record, from its stored header: header fields an edit cannot change (read-only in the form, with a hint; the
   * server refuses a change with 422). Actions still change them (e.g. an end date moved only by Extend).
   */
  lockedFields?: (header: Row) => string[];
  /** Per record, from its stored header: false hides Delete and the server refuses the delete. */
  deletableWhen?: (header: Row) => boolean;
}

/** A selection bar and an editable grid of amounts (spec §5). */
export interface ItemsModuleDef<L> extends ModuleBase<L> {
  kind: 'items';
  noun: [singular: string, plural: string];
  entity: string;
  /** Selection fields first, then the item's own keys (['company', 'month', 'year', 'gl']). */
  keys: string[];
  selection: FieldDef<L>[];
  grid: FieldDef<L>[];
  /** Amount fields summed in the footer, per currency. */
  totals?: string[];
  /** Cross-row rules. */
  check?: (rows: Row[], selection: Row, lk: L) => { row?: number; field?: string; message: string }[];
  /** Default 5000. */
  maxRows?: number;
}

/** A spreadsheet checked row by row, then posted at once (spec §6). */
export interface UploadModuleDef<L> extends ModuleBase<L> {
  kind: 'upload';
  noun: [singular: string, plural: string];
  entity: string;
  keys: string[];
  /** File columns, in template order. */
  columns: FieldDef<L>[];
  mode: 'create' | 'upsert';
  /** Post only when every row is valid. */
  strict?: boolean;
  /** Defaults 5000 rows, 5 MB. */
  maxRows?: number;
  maxBytes?: number;
  check?: (rows: Row[], lk: L) => { row: number; field?: string; message: string }[];
}

/** A report (spec §3): a typed selection bar and Run, then a formatted report or line items with ALV layouts. */
export interface ReportModuleDef<L> extends ModuleBase<L> {
  kind: 'report';
  /** How a breakdown (drill row) opens: a pop-up or a page. */
  breakdownOpens: 'popup' | 'page';
  /** Typed selection bar; remembered per module (storageKey). */
  selection: FieldDef<L>[];
  check?: (selection: Row, lk: L) => { field?: string; message: string }[];
  report: ReportDef;
  /** Display units; default Absolute, Thousands, Lakhs, Crores. */
  units?: Unit[];
  drill?: (row: Row, column: string | null, selection: Row) => DrillTarget;
  /** The selection it opens with, e.g. today as the key date and 60 days; the last run's values and the URL's win. */
  defaults?: (lk: L) => Row;
  /** Runs at once with `defaults` (or what the URL or the last run holds) when the selection passes its checks. */
  autoRun?: boolean;
  /**
   * Reads another module's records instead of an entity of its own: that object module's header rows (`report.entity`
   * is its `list.entity`) and lookups (mapped by its own `lookups`), through that module's backend. No contract, seed or
   * source of its own in the registry: its data source is the module's (sourceOf; a registered one is ignored), so it
   * runs where that data lives.
   */
  source?: { module: string };
}

/** A dashboard (spec §6): a period bar and Show, then tiles, charts and a summary table loaded by its server part. */
export interface DashboardModuleDef<L> extends ModuleBase<L> {
  kind: 'dashboard';
  selection: FieldDef<L>[];
  check?: (selection: Row, lk: L) => { field?: string; message: string }[];
  units?: Unit[];
  /** 1–12; default 1 (April = 4 for the Indian financial year). */
  quarterStartMonth?: number;
  sections: DashboardSection[];
  /** A selection that loads every section on the sample data (seed): the template's tests run the dashboard with it. */
  sampleSelection?: Row;
  /** Loads at once, with `defaults` (or what the URL or the last run holds), without Show. Always so without selection fields. */
  autoRun?: boolean;
  /** Initial amount unit, without changing the order of the unit buttons. */
  defaultUnit?: string;
  /** The selection it opens with, e.g. today as the key date and every company code. */
  defaults?: (lk: L) => Row;
  /**
   * Shown as an Overview (the catalogue's overview page names it): a key date bar (its first date field, with Change key
   * date), a controls panel (title, `description`, Open full report, its first segmented field as the scope toggle, the
   * amount unit toggle, Refresh and the `scopeLine`), then the sections as cards.
   */
  overview?: {
    description?: string;
    /** The module "Open full report" opens, with the selection's values as its filters where it has the fields. */
    fullReport?: string;
    scopeLine?: (selection: Row, lk: L) => string;
  };
}

export type ModuleKind = 'table' | 'object' | 'items' | 'upload' | 'report' | 'dashboard';
// Definitions differ only in their lookup type; services and screens are generic over it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyModuleDef = ModuleDef<any> | ObjectModuleDef<any> | ItemsModuleDef<any> | UploadModuleDef<any> | ReportModuleDef<any> | DashboardModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyReportDef = ReportModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyDashboardDef = DashboardModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyObjectDef = ObjectModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyItemsDef = ItemsModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyUploadDef = UploadModuleDef<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types
export type AnyItemsTab = ItemsTab<any>;

/** How a module's tables map to an OData V4 service. */
export interface ODataContract {
  service: string;
  /** Property naming: 'pascal' fromNo → FromNo, 'rap' ZSRC_GRP → ZsrcGrp. Per-field overrides in `fields`. */
  naming: 'pascal' | 'rap';
  pageSize?: number;
  /** The entities declare an ETag: PATCH and DELETE send If-Match (the row's ETag, else '*'). */
  etag?: boolean;
  /** Edm.Decimal / Edm.Int fields, sent as JSON numbers ('' as null). */
  numbers?: string[];
  flagType?: 'boolean' | 'char';
  keyTypes?: Record<string, 'string' | 'date' | 'number'>;
  /** Every table, also an object's header and item tables. */
  tables: Record<string, { entitySet: string; fields?: Record<string, string> }>;
  lookups?: Record<string, { entitySet: string; fields: Record<string, string> }>;
  /**
   * Object modules: the navigation property of each items tab (required) and the bound action name of each action.
   * `itemEtag`: 'own' (default) when the items have their own ETag; 'parent' when they share the header's
   * (RAP `etag dependent by _Parent`).
   */
  object?: { items: Record<string, { navigation: string }>; actions?: Record<string, string>; itemEtag?: 'own' | 'parent' };
}

/**
 * A module whose data an external REST data service keeps (source `rest`, FE + BE + DB only): the BackEnd reads and
 * writes it there (BackEnd/src/rest/), never the browser. The service is listed in `src/config/rest-services.json`
 * (its base URL; the BackEnd environment's `REST_<KEY>_URL` overrides it). The protocol is the SLC middleware's:
 * `GET data/<resource>?<COLUMN>=…&sort=…&limit=…&offset=…` → `{ rows }`, `POST data/<resource> { data }` →
 * `{ key, assignedNumber }`, `PATCH { key, changes }`, `DELETE { key }`.
 */
export interface RestContract {
  /** The `key` of the service in `src/config/rest-services.json`. */
  service: string;
  /** Every table of the module (an object's header and item tables too). */
  tables: Record<string, RestTable>;
  /**
   * Value lists read from the service (the module's `lookups(raw)` maps them): lookup name → resource, an optional
   * column filter (`{ ZORIGIN: 'X' }`) and field → column. Without them the lookups are the seed's.
   */
  lookups?: Record<string, { resource: string; filter?: Record<string, string>; columns: Record<string, string> }>;
}
export interface RestTable {
  /** The service's resource name (`data/<resource>`). */
  resource: string;
  /** Module field → the service's column, for every field the table stores (keys included). */
  columns: Record<string, string>;
  /** Decimal and integer fields, sent as JSON numbers ('' as null). */
  numbers?: string[];
  /** The key field the service draws from its own number range: left out on create, read back as `assignedNumber`. */
  assigned?: string;
  /** Audit columns the BackEnd fills: by (the acting user), date (YYYY-MM-DD) and time (HH:MM:SS) on create and on change. */
  stamps?: { createdBy?: string; createdDate?: string; createdTime?: string; changedBy?: string; changedDate?: string; changedTime?: string };
  /**
   * Fields the BackEnd works out before every create and change, from the whole row (stored values merged with the
   * change) and the lookups: descriptions other systems read from the same table, an amount in another currency.
   * Returns module fields; each must be in `columns`. Pure.
   */
  derive?: (row: Row, lookups: Record<string, Row[]>) => Row;
}

export interface ModuleSeed { tables: Record<string, Row[]>; lookups?: Record<string, Row[]> }
