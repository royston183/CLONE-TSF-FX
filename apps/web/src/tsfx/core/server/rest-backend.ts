// A module's data in an external REST data service (source `rest`): the Backend the BackEnd uses instead of its own
// tables. The protocol is the SLC middleware's (FrontEnd/src/modules/types.ts RestContract). The ETag of a row is a hash
// of its content, so object-service and the planner refuse a save when the row changed since it was read; the service
// has no transaction across rows, so a multi-row write that fails part-way says how far it got.
import { sha256Hex } from '../crypto';
import { keyOf, str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { HttpError } from '@tsfx/lib/errors';
import type { PlanOp } from '@tsfx/lib/planner';
import type { ModuleData } from '@tsfx/modules/server-registry';
import { moduleTables, seedOf } from '@tsfx/modules/tables';
import type { ModuleSeed, RestContract, RestTable } from '@tsfx/modules/types';
import type { Actor } from '@tsfx/core/actor';
import type { Backend, ObjectSpec, StoredObject } from '@tsfx/core/server/backend';
import { applyQuery } from '@tsfx/core/server/list-query';

/** The service's largest page; longer reads are paged. */
export const REST_PAGE = 500;
/** At most this many rows are read for one table (a list, a lookup or a load); more is refused with 422. */
export const REST_MAX_ROWS = 20000;
const KEYS_PER_REQUEST = 100;
const TIMEOUT_MS = 30000;

/** Where a REST service is reached: its base URL and the headers every call sends. */
export interface RestEndpoint { key: string; title: string; base: string; headers: Record<string, string>; fetch?: typeof fetch; timeoutMs?: number }


const pad = (n: number) => String(n).padStart(2, '0');
const stampNow = (now: Date) => ({
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
});
const etagOf = (row: Row): string => `W/"rest-${sha256Hex(JSON.stringify(Object.keys(row).filter(k => k !== '__etag').sort().map(k => [k, row[k]]))).slice(0, 20)}"`;
const chunks = <T>(xs: T[], size: number): T[][] => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));
const asText = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v));

export function restBackend(id: string, entry: ModuleData, endpoint: RestEndpoint): Backend {
  const contract = entry.rest;
  if (!contract) throw new HttpError(500, `${id} has source rest but no rest contract.`);
  const infos = moduleTables(entry.def);
  const doFetch = endpoint.fetch ?? fetch;
  let seedCache: ModuleSeed | undefined;
  const sample = seedOf(entry);
  const seedLookups = () => structuredClone((seedCache ??= typeof sample === 'function' ? sample() : sample ?? { tables: {} }).lookups ?? {});

  const need = (table: string): RestTable => {
    const t = contract.tables[table];
    if (!t) throw new HttpError(404, 'Unknown table.');
    return t;
  };
  const column = (t: RestTable, field: string): string => {
    const c = t.columns[field];
    if (!c) throw new HttpError(500, `${id}: the field ${field} has no column in the rest contract of ${t.resource}.`);
    return c;
  };

  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', resource: string, query = '', body?: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(`${endpoint.base}/data/${encodeURIComponent(resource)}${query ? `?${query}` : ''}`, {
        method,
        headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...endpoint.headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(endpoint.timeoutMs ?? TIMEOUT_MS)
      });
    } catch (error) {
      throw new HttpError(502, (error as Error)?.name === 'TimeoutError'
        ? `${endpoint.title} did not answer in time. Try again.`
        : `Cannot reach ${endpoint.title}. Check the connection and try again.`);
    }
    let data: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text) as Record<string, unknown>; } catch { throw new HttpError(502, `${endpoint.title} answered ${resource} with an invalid response.`); }
    }
    if (!response.ok || data.ok === false) {
      const error = data.error as { message?: string | { value?: string } } | string | undefined;
      const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : error?.message?.value;
      const status = response.status === 404 ? 404 : response.status === 409 ? 409 : response.status === 400 || response.status === 422 ? 422 : 502;
      throw new HttpError(status, message ? `${endpoint.title}: ${message}` : `${endpoint.title} refused the request (${response.status}).`);
    }
    return data;
  }

  /** A stored row as the module sees it: every mapped field as text ('' for null), with its content ETag. */
  const fromWire = (t: RestTable, raw: Record<string, unknown>): Row => {
    const row: Row = {};
    for (const [field, col] of Object.entries(t.columns)) row[field] = asText(raw[col]);
    return { ...row, __etag: etagOf(row) };
  };
  /** The given fields of a row as the service's columns; numbers as JSON numbers. */
  const toWire = (t: RestTable, row: Row, fields: string[]): Record<string, unknown> => {
    const numbers = new Set(t.numbers ?? []);
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (f === '__etag' || !(f in row)) continue;
      const v = str(row[f]);
      out[column(t, f)] = numbers.has(f) ? (v === '' ? 0 : Number(v)) : v;
    }
    return out;
  };
  const stamps = (t: RestTable, actor: Actor, create: boolean): Record<string, unknown> => {
    const s = t.stamps;
    if (!s) return {};
    const { date, time } = stampNow(new Date());
    const who = actor.username.slice(0, 12).toUpperCase();
    const out: Record<string, unknown> = {};
    if (create) {
      if (s.createdBy) out[s.createdBy] = who;
      if (s.createdDate) out[s.createdDate] = date;
      if (s.createdTime) out[s.createdTime] = time;
    }
    if (s.changedBy) out[s.changedBy] = create ? '' : who;
    if (s.changedDate) out[s.changedDate] = create ? '' : date;
    if (s.changedTime) out[s.changedTime] = create ? '00:00:00' : time;
    return out;
  };

  /** Every row of a table that matches the column filter, read page by page. */
  async function readAll(t: RestTable, filter: Record<string, string> = {}): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += REST_PAGE) {
      const q = new URLSearchParams({ ...filter, limit: String(REST_PAGE), offset: String(offset) });
      const data = await call('GET', t.resource, q.toString());
      if (!Array.isArray(data.rows)) throw new HttpError(502, `${endpoint.title} answered ${t.resource} without rows.`);
      rows.push(...(data.rows as Record<string, unknown>[]).map(r => fromWire(t, r)));
      if (rows.length > REST_MAX_ROWS) throw new HttpError(422, `Too many rows (more than ${REST_MAX_ROWS.toLocaleString('en-US')}). Narrow the selection.`);
      if (data.rows.length < REST_PAGE) return rows;
    }
  }
  /** The stored rows with these keys (by the key fields `keys`), compared exactly. */
  async function rowsByKeys(t: RestTable, keys: string[], wanted: Row[]): Promise<Row[]> {
    if (!wanted.length) return [];
    const tab = { keys };
    const want = new Set(wanted.map(k => keyOf(tab, k)));
    const found: Row[] = [];
    if (keys.length === 1) {
      for (const part of chunks([...new Set(wanted.map(k => str(k[keys[0]])))], KEYS_PER_REQUEST)) {
        found.push(...await readAll(t, { [`${column(t, keys[0])}[in]`]: part.join(',') }));
      }
    } else {
      for (const k of wanted) found.push(...await readAll(t, Object.fromEntries(keys.map(f => [column(t, f), str(k[f])]))));
    }
    const seen = new Set<string>();
    return found.filter(r => { const k = keyOf(tab, r); if (!want.has(k) || seen.has(k)) return false; seen.add(k); return true; });
  }
  /** The value lists: read from the service's resources when the contract names them, else the seed's. */
  async function lookups(): Promise<Record<string, Row[]>> {
    if (!contract?.lookups) return seedLookups();
    // The value lists are independent: read them side by side.
    const lists = await Promise.all(Object.entries(contract.lookups).map(async ([name, l]) =>
      [name, (await readAll({ resource: l.resource, columns: l.columns }, l.filter ?? {})).map(r => { const row = { ...r }; delete row.__etag; return row; })] as const));
    return Object.fromEntries(lists);
  }
  /** The derived fields of a row (RestTable.derive), with the lookups they need. */
  const derived = async (t: RestTable, row: Row): Promise<Row> => (t.derive ? t.derive(row, await lookups()) : {});

  const wireKey = (t: RestTable, keys: string[], row: Row) => Object.fromEntries(keys.map(k => [column(t, k), str(row[k])]));

  async function create(t: RestTable, keys: string[], row: Row, actor: Actor): Promise<Row> {
    const blank = keys.filter(k => !str(row[k]));
    if (blank.length && !(blank.length === 1 && blank[0] === t.assigned)) {
      throw new HttpError(422, `${blank.join(', ')} is required.`);
    }
    row = { ...row, ...await derived(t, row) };
    const fields = Object.keys(t.columns).filter(f => f !== t.assigned || str(row[f]));
    const data = await call('POST', t.resource, '', { data: { ...toWire(t, row, fields), ...stamps(t, actor, true) } });
    const assigned = asText(data.assignedNumber) || asText((data.key as Record<string, unknown> | undefined)?.[t.assigned ? column(t, t.assigned) : '']);
    return t.assigned && !str(row[t.assigned]) ? { ...row, [t.assigned]: assigned } : row;
  }
  async function update(t: RestTable, keys: string[], key: Row, changes: Row, actor: Actor): Promise<void> {
    if (t.derive) {
      // Derived fields follow the whole row: the stored values with this change.
      const [stored] = await rowsByKeys(t, keys, [key]);
      if (!stored) throw new HttpError(404, 'This entry no longer exists.');
      const next = await derived(t, { ...stored, ...changes });
      changes = { ...changes, ...Object.fromEntries(Object.entries(next).filter(([f, v]) => str(v) !== str(stored[f]))) };
    }
    const fields = Object.keys(changes).filter(f => !keys.includes(f) && f in t.columns);
    await call('PATCH', t.resource, '', { key: wireKey(t, keys, key), changes: { ...toWire(t, changes, fields), ...stamps(t, actor, false) } });
  }
  const remove = (t: RestTable, keys: string[], key: Row) => call('DELETE', t.resource, '', { key: wireKey(t, keys, key) });

  /** The table's operations in order; a failure after the first write names how many were saved. */
  async function applyOps(t: RestTable, keys: string[], ops: PlanOp[], actor: Actor): Promise<void> {
    let done = 0;
    try {
      for (const o of ops) {
        if (o.op === 'create') await create(t, keys, { ...o.data, ...o.key }, actor);
        else if (o.op === 'update') await update(t, keys, o.key, o.data ?? {}, actor);
        else await remove(t, keys, o.key);
        done++;
      }
    } catch (error) {
      if (done && error instanceof HttpError) throw new HttpError(error.status, `${error.message} (${done} of ${ops.length} changes were saved before it; refresh to see them.)`, error.details);
      throw error;
    }
  }

  async function readObject(spec: ObjectSpec, key: Row): Promise<StoredObject | null> {
    const [header] = await rowsByKeys(need(spec.table), spec.keys, [key]);
    if (!header) return null;
    const items: Record<string, Row[]> = {};
    for (const i of spec.items) {
      const t = need(i.table);
      const rows = await readAll(t, Object.fromEntries(spec.keys.map(k => [column(t, k), str(key[k])])));
      items[i.tab] = rows.filter(r => spec.keys.every(k => r[k] === key[k]));
    }
    return { header, items };
  }

  return {
    mode: 'local',
    async load() {
      const tables: Record<string, Row[]> = {};
      for (const [table, info] of Object.entries(infos)) if (!info.large && contract.tables[table]) tables[table] = await readAll(contract.tables[table]);
      return { tables, lookups: await lookups() };
    },
    lookups: () => lookups(),
    async apply(actor, table, ops) {
      const info = infos[table];
      if (!info) throw new HttpError(404, 'Unknown table.');
      await applyOps(need(table), info.keys, ops, actor);
    },
    async query(_actor, table, list, q) {
      const numbers = new Set(need(table).numbers ?? []);
      return applyQuery(await readAll(need(table)), q, list, numbers, { caseless: true });
    },
    async readKeys(_actor, table, keys) {
      const info = infos[table];
      if (!info || !contract.tables[table]) return [];
      return rowsByKeys(contract.tables[table], info.keys, keys);
    },
    readObject: (_actor, spec, key) => readObject(spec, key),
    async writeObject(actor, spec, w) {
      const header = need(spec.table);
      let key: Row = Object.fromEntries(spec.keys.map(k => [k, str(w.key[k])]));
      if (w.op === 'create') {
        const saved = await create(header, spec.keys, { ...w.header, ...key }, actor);
        key = Object.fromEntries(spec.keys.map(k => [k, str(saved[k])]));
      } else if (w.op === 'delete') {
        const stored = await readObject(spec, key);
        for (const i of spec.items) for (const r of stored?.items[i.tab] ?? []) await remove(need(i.table), i.keys, r);
        await remove(header, spec.keys, key);
        return key;
      } else if (Object.keys(w.header).length) {
        await update(header, spec.keys, key, w.header, actor);
      }
      for (const i of spec.items) {
        const ops: PlanOp[] = w.items.filter(c => c.tab === i.tab).map(c => ({ op: c.op, id: '', key: { ...key, ...c.key }, data: { ...c.data, ...key, ...c.key } }));
        await applyOps(need(i.table), i.keys, ops, actor);
      }
      return key;
    },
    async action(actor, spec, key, _etag, _name, mock) {
      if (!mock) return;
      const t = need(spec.table);
      const [stored] = await rowsByKeys(t, spec.keys, [key]);
      if (!stored) throw new HttpError(404, 'This entry no longer exists.');
      const after = mock(stored);
      const changed = Object.fromEntries(Object.keys(t.columns).filter(f => !spec.keys.includes(f) && str(after[f]) !== str(stored[f])).map(f => [f, after[f]]));
      if (Object.keys(changed).length) await update(t, spec.keys, key, changed, actor);
    }
  };
}
