import type { Row } from '@tsfx/lib/grid/types';
import type { AnyList, ListPage, ListQuery } from '@tsfx/lib/list/types';
import type { ItemChange } from '@tsfx/lib/object/object';
import type { PlanOp } from '@tsfx/lib/planner';
import type { Actor } from '../actor';

import type { StoreState } from '../platform';

export type { StoreState };

export const CONFLICT_MESSAGE = 'This entry was changed by someone else. Refresh and try again.';
export const NO_SAP_ACCOUNT = 'No SAP account is set. Enter your SAP user in Settings → SAP Connection.';

/** Where an object lives: its header table and keys, and per items tab the item table, keys and navigation. */
export interface ObjectSpec { table: string; keys: string[]; items: { tab: string; table: string; keys: string[]; navigation: string; keyBySap?: boolean }[] }
/** An object as stored: the header (with __etag) and the rows of each items tab. */
export interface StoredObject { header: Row; items: Record<string, Row[]> }
/** One object write. `header`: every field on create, only the changed ones on update; `items`: per item, by own key. */
export interface ObjectWrite { op: 'create' | 'update' | 'delete'; key: Row; etag?: string; header: Row; items: ItemChange[] }

/** Where a module's tables live: SAP through OData V4, or a local store (the application's own data or sample data). */
export interface Backend {
  mode: 'odata' | 'local';
  /** Table modules: every (non-large) table and the lookups. */
  load(actor: Actor): Promise<StoreState>;
  /** The lookups alone (object, items and upload modules never load their tables whole). */
  lookups(actor: Actor): Promise<Record<string, Row[]>>;
  apply(actor: Actor, table: string, ops: PlanOp[]): Promise<void>;
  /** One page of a large table: SAP filters, sorts and pages it (a local store does the same in memory). */
  query(actor: Actor, table: string, list: AnyList, q: ListQuery): Promise<ListPage>;
  /** The stored rows with these keys (OData: 40 keys per request, so the URL stays short). */
  readKeys(actor: Actor, table: string, keys: Row[]): Promise<Row[]>;
  /** One object with its items (OData: `Entity(key)?$expand=…` in one request); null when it does not exist. */
  readObject(actor: Actor, spec: ObjectSpec, key: Row): Promise<StoredObject | null>;
  /** All changes of one object as one $batch changeset; returns the object's key (assigned by SAP on create). */
  writeObject(actor: Actor, spec: ObjectSpec, write: ObjectWrite): Promise<Row>;
  /** A bound action (SAP runs it; a local store applies `mock` to the stored header). */
  action(actor: Actor, spec: ObjectSpec, key: Row, etag: string | undefined, name: string, mock?: (header: Row) => Row): Promise<void>;
}
