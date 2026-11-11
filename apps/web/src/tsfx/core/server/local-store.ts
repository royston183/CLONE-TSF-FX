import { keyOf } from '@tsfx/lib/grid/grid';
import type { Row, StampFields } from '@tsfx/lib/grid/types';
import { HttpError } from '@tsfx/lib/errors';
import { isTableModule } from '@tsfx/modules/registry';
import type { ModuleData } from '@tsfx/modules/server-registry';
import { contractOf, moduleTables, seedOf, type TableInfo } from '@tsfx/modules/tables';
import type { ModuleSeed } from '@tsfx/modules/types';
import type { LayoutStore, StoredLayout, StoreState } from '../platform';
import type { Backend, ObjectSpec, StoredObject } from './backend';
import type { ItemChange } from '@tsfx/lib/object/object';
import { applyQuery } from './list-query';
import { applyLocal, type PlanOp } from '@tsfx/lib/planner';

/** Where a local backend keeps a module's state: the platform's database or browser storage, or memory. */
export interface StateStore { load(): Promise<StoreState | null>; save(s: StoreState): Promise<void> }

/** A state store in memory: kept as long as the backend that uses it (a module on its sample data). */
export function memoryStateStore(): StateStore {
  let state: StoreState | null = null;
  return { load: async () => state, save: async next => { state = next; } };
}

/** A layout store in memory (the layouts of a module on its sample data). */
export function memoryLayoutStore(): LayoutStore {
  let layouts: StoredLayout[] = [];
  return { load: async () => layouts.map(l => ({ ...l })), save: async next => { layouts = next.map(l => ({ ...l })); } };
}

/** A module's local backend over a state store: its tables, stamps, sample data and numeric fields from its entry. */
export function moduleLocalBackend(id: string, entry: ModuleData, store: StateStore): Backend {
  return localBackend(id, store, moduleTables(entry.def), isTableModule(entry.def) ? entry.def.stamps : undefined, seedOf(entry), contractOf(entry).numbers);
}

/** The next free number of a key SAP would assign (width of the widest number so far). */
export const nextNumber = (rows: Row[], field: string): string => {
  const numbers = rows.map(r => r[field] ?? '').filter(v => /^\d+$/.test(v));
  const width = Math.max(1, ...numbers.map(v => v.length));
  const top = numbers.reduce((n, v) => (BigInt(v) > n ? BigInt(v) : n), BigInt(0));
  return (top + BigInt(1)).toString().padStart(width, '0');
};

/**
 * A module's tables in a local store, seeded once from the module's sample data: the application's own data (the
 * SQLite / MySQL database on the server, browser storage in a Front end only app) or sample data kept in memory.
 */
export function localBackend(moduleId: string, store: StateStore, tables: Record<string, TableInfo>, stamps: StampFields | undefined, seed: ModuleSeed | (() => ModuleSeed), numericFields: string[] = []): Backend {
  let state: StoreState | null = null;
  /** The live state (callers copy what they hand out). */
  async function current(): Promise<StoreState> {
    if (!state) {
      let stored: StoreState | null;
      try {
        stored = await store.load();
      } catch {
        throw new HttpError(500, `The stored data of ${moduleId} is unreadable, so nothing was changed. Check the store it is kept in.`);
      }
      if (stored) state = stored;
      else {
        const s = typeof seed === 'function' ? seed() : seed;
        state = { tables: structuredClone(s.tables), lookups: structuredClone(s.lookups ?? {}) };
      }
    }
    return state;
  }
  async function save(next: StoreState): Promise<void> {
    // The store writes the whole state at once (one transaction), so a crash never leaves half a store behind.
    await store.save(next);
    state = next;
  }
  let version = 0;
  const SEED_ETAG = 'W/"local-seed"';
  // A local store detects concurrent saves too: every object write gives the header a new ETag.
  const newEtag = () => `W/"local-${Date.now()}-${++version}"`;
  const sameObject = (spec: ObjectSpec, r: Row, key: Row) => spec.keys.every(k => r[k] === key[k]);
  async function readObject(spec: ObjectSpec, key: Row): Promise<StoredObject | null> {
    const st = await current();
    const header = (st.tables[spec.table] ?? []).find(r => sameObject(spec, r, key));
    if (!header) return null;
    // A seeded row has no ETag yet: give it a fixed one, so the first concurrent save is detected too.
    return structuredClone({ header: { ...header, __etag: header.__etag ?? SEED_ETAG }, items: Object.fromEntries(spec.items.map(i => [i.tab, (st.tables[i.table] ?? []).filter(r => sameObject(spec, r, key))])) });
  }
  return {
    mode: 'local',
    load: async () => structuredClone(await current()),
    lookups: async () => structuredClone((await current()).lookups),
    async query(_actor, table, list, q) {
      const page = applyQuery((await current()).tables[table] ?? [], q, list, new Set(numericFields));
      return { ...page, rows: page.rows.map(r => ({ ...r })) };
    },
    async readKeys(_actor, table, keys) {
      const info = tables[table];
      if (!info) return [];
      const wanted = new Set(keys.map(k => keyOf(info, k)));
      return ((await current()).tables[table] ?? []).filter(r => wanted.has(keyOf(info, r))).map(r => ({ ...r }));
    },
    readObject: (_actor, spec, key) => readObject(spec, key),
    async writeObject(actor, spec, w) {
      const st = await current();
      const tables = { ...st.tables };
      let key: Row = Object.fromEntries(spec.keys.map(k => [k, w.key[k] ?? '']));
      if (w.op === 'create' && spec.keys.some(k => !key[k])) key = { ...key, [spec.keys[0]]: nextNumber(tables[spec.table] ?? [], spec.keys[0]) };
      const headerOps: PlanOp[] = w.op === 'create' ? [{ op: 'create', id: '', key, data: { ...w.header, ...key, __etag: newEtag() } }]
        : w.op === 'delete' ? [{ op: 'delete', id: '', key }]
        : [{ op: 'update', id: '', key, data: { ...w.header, __etag: newEtag() } }];
      tables[spec.table] = applyLocal({ keys: spec.keys }, undefined, tables[spec.table] ?? [], headerOps, actor.username);
      for (const i of spec.items) {
        const rows = tables[i.table] ?? [];
        if (w.op === 'delete') { tables[i.table] = rows.filter(r => !sameObject(spec, r, key)); continue; }
        // keyBySap items: sample data numbers a new row's empty keys itself (a date key gets today, others the next number).
        const assigned = (c: ItemChange): Row => {
          if (!i.keyBySap || c.op !== 'create') return c.key;
          const out: Row = { ...c.key };
          for (const k of i.keys) if (!out[k] && !Object.hasOwn(key, k)) out[k] = /date$/i.test(k) ? new Date().toISOString().slice(0, 10) : nextNumber([...rows, ...pending], k);
          return out;
        };
        const pending: Row[] = [];
        const ops: PlanOp[] = w.items.filter(c => c.tab === i.tab).map(c => {
          const own = assigned(c);
          pending.push(own);
          return { op: c.op, id: '', key: { ...key, ...own }, data: { ...c.data, ...key, ...own } };
        });
        tables[i.table] = applyLocal({ keys: i.keys }, undefined, rows, ops, actor.username);
      }
      await save({ ...st, tables });
      return key;
    },
    async action(_actor, spec, key, _etag, _name, mock) {
      if (!mock) return;
      const st = await current();
      const rows = st.tables[spec.table] ?? [];
      await save({ ...st, tables: { ...st.tables, [spec.table]: rows.map(r => (sameObject(spec, r, key) ? { ...mock(r), __etag: newEtag() } : r)) } });
    },
    async apply(actor, table, ops) {
      const info = tables[table];
      if (!info) throw new HttpError(404, 'Unknown table.');
      const now = await current();
      await save({ ...now, tables: { ...now.tables, [table]: applyLocal(info, stamps, now.tables[table] ?? [], ops, actor.username) } });
    }
  };
}
