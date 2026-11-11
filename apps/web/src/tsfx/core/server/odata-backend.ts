import { behaviourOf, isFlag, typeOf, valueFields } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';
import { buildBatch, parseBatch, type BatchAnswer, type BatchOp } from '../sap/batch';
import { readAll, REJECTED_MESSAGE, sapRequest, type SapService, type SapSettings } from '../sap/client';
import { HttpError } from '@tsfx/lib/errors';
import { entityPath, nextQuery, odataString, rowsOf, sapErrorMessage } from '../sap/odata';
import { moduleTables, type TableInfo } from '@tsfx/modules/tables';
import type { AnyModuleDef, ODataContract } from '@tsfx/modules/types';
import { CONFLICT_MESSAGE, NO_SAP_ACCOUNT, type Backend, type ObjectSpec } from './backend';
import { listODataQuery } from './list-query';
import type { PlanOp } from '@tsfx/lib/planner';
import type { Actor } from '../actor';

export { CONFLICT_MESSAGE, NO_SAP_ACCOUNT };

/** The acting user's SAP connection; refused when there is none. */
function sapOf(actor: Actor) {
  if (!actor.sap) throw new HttpError(502, NO_SAP_ACCOUNT);
  return actor.sap;
}

const pascal = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const rap = (f: string) => f.toLowerCase().split('_').filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join('');

const TYPED = new Set(['amount', 'decimal', 'date']);

/** SAP <-> application values of a set of tables: typed fields convert by type, others as the contract says. */
export function tableCodec(contract: ODataContract, tables: Record<string, TableInfo>) {
  const naming = contract.naming === 'rap' ? rap : pascal;
  const prop = (table: string, field: string) => contract.tables[table]?.fields?.[field] ?? naming(field);
  const numbers = new Set(contract.numbers ?? []);
  const defs = new Map(Object.entries(tables).flatMap(([t, info]) => valueFields(info.defs).map(c => [`${t}|${c.field}`, c] as const)));
  const typed = (table: string, f: string) => { const c = defs.get(`${table}|${f}`); return c && TYPED.has(typeOf(c)) ? c : undefined; };
  const flag = (table: string, f: string) => { const c = defs.get(`${table}|${f}`); return Boolean(c && isFlag(c)); };
  const toApp = (table: string, raw: Record<string, unknown>): Row => {
    const row: Row = Object.fromEntries((tables[table]?.fields ?? []).map(f => {
      const v = raw[prop(table, f)];
      const c = typed(table, f);
      if (c) return [f, behaviourOf(c).fromSap(v, c)];
      return [f, flag(table, f) ? (v === true || String(v ?? '').toUpperCase() === 'X' ? 'X' : '') : v == null ? '' : String(v)];
    }));
    if (typeof raw['@odata.etag'] === 'string') row.__etag = raw['@odata.etag'];
    return row;
  };
  // Edm.Decimal values must be JSON numbers (a quoted amount fails on SAP); flags follow the contract's type;
  // Edm.Int fields listed in `numbers` are numbers too, and an empty one is null (never '').
  const valueOut = (table: string, f: string, v: string): unknown => {
    const c = typed(table, f);
    if (c) return behaviourOf(c).toSap(v, c);
    if (flag(table, f)) return contract.flagType === 'boolean' ? v === 'X' : v;
    if (numbers.has(f)) return v === '' ? null : Number(v);
    return v;
  };
  return { prop, toApp, valueOut, numbers };
}

export const valueCodec = (def: AnyModuleDef, contract: ODataContract) => tableCodec(contract, moduleTables(def));

/** Where a module's OData service is (on the relay) and the SAP client and timeout its calls use. */
export interface SapTarget { service: SapService; settings: SapSettings }

/** Reads and writes a module's tables through its OData V4 service (ported from ALM server/maintenance.mjs). */
export function odataBackend({ service, settings }: SapTarget, def: AnyModuleDef, contract: ODataContract): Backend {
  const tables = moduleTables(def);
  const { prop, toApp, valueOut, numbers } = tableCodec(contract, tables);
  const bodyOf = (table: string, data: Row) => Object.fromEntries(Object.entries(data).map(([f, v]) => [prop(table, f), valueOut(table, f, v)]));
  /** An item create: keys SAP assigns (keyBySap) are left out while empty. */
  const itemBody = (i: { table: string; keys: string[]; keyBySap?: boolean }, data: Row) =>
    bodyOf(i.table, i.keyBySap ? Object.fromEntries(Object.entries(data).filter(([f, v]) => !(i.keys.includes(f) && !v))) : data);
  const keyPath = (table: string, key: Row) => entityPath(
    contract.tables[table].entitySet,
    Object.fromEntries(Object.entries(key).map(([f, v]) => [prop(table, f), v])),
    Object.fromEntries(Object.entries(contract.keyTypes ?? {}).map(([f, t]) => [prop(table, f), t]))
  );
  // Never send If-Match to an entity without an ETag: SAP rejects it.
  const etagOf = (o: PlanOp) => o.etag ?? (contract.etag ? '*' : undefined);
  const request = (table: string, o: PlanOp): BatchOp => (o.op === 'create'
    ? { method: 'POST', path: contract.tables[table].entitySet, body: bodyOf(table, o.data ?? {}) }
    : { method: o.op === 'update' ? 'PATCH' : 'DELETE', path: keyPath(table, o.key), body: o.op === 'update' ? bodyOf(table, o.data ?? {}) : undefined, etag: etagOf(o) });
  const fail = (status: number, message: string, id?: string): never => {
    if (status === 401) throw new HttpError(502, REJECTED_MESSAGE);
    if (status === 412) throw new HttpError(409, CONFLICT_MESSAGE);
    throw new HttpError(502, id ? `SAP rejected entry ${id}: ${message}` : `SAP rejected the changes: ${message}`);
  };

  const readLookups = async (actor: Actor): Promise<Record<string, Row[]>> => Object.fromEntries(await Promise.all(
    Object.entries(contract.lookups ?? {}).map(async ([name, spec]) => [name,
      (await readAll(settings, sapOf(actor), service, spec.entitySet)).map(r => Object.fromEntries(Object.entries(spec.fields).map(([f, p]) => [f, String(r[p] ?? '')])))] as const)));

  const KEY_CHUNK = 40;
  const jsonOf = (text: string, what: string): Record<string, unknown> => {
    try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new HttpError(502, `SAP did not return JSON for ${what}. Check the service URL and authentication.`); }
  };
  // Key values were cleaned by their field types; a number or date key that is not one is quoted, never sent raw.
  const keyLiteral = (field: string, value: string) => {
    const t = contract.keyTypes?.[field] ?? 'string';
    return (t === 'number' && /^-?\d+$/.test(value)) || (t === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : odataString(value);
  };

  const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.map(k => [k, row[k] ?? '']));
  const ifMatch = (etag?: string) => etag || (contract.etag ? '*' : undefined);
  /** Operations as ONE changeset: SAP applies all of them or none. */
  async function sendBatch(actor: Actor, ops: BatchOp[]): Promise<BatchAnswer> {
    const batch = buildBatch(ops);
    const r = await sapRequest(settings, sapOf(actor), service, { method: 'POST', path: '$batch', body: batch.body, contentType: batch.contentType, accept: 'multipart/mixed', timeoutMs: Math.max(settings.timeoutMs, 120000) });
    if (r.status >= 400) fail(r.status, sapErrorMessage(r.status, r.text));
    const answer = parseBatch(r.text);
    if (!answer.ok) {
      const status = answer.statuses.find(s => s >= 400) ?? 502;
      fail(status, answer.message || `HTTP ${status}`);
    }
    return answer;
  }
  const headerPath = (spec: ObjectSpec, key: Row) => keyPath(spec.table, pick(key, spec.keys));
  /** Objects on SAP need the contract's navigation of every items tab. */
  const assertNavigations = (spec: ObjectSpec) => {
    const missing = spec.items.find(i => !i.navigation);
    if (missing) throw new HttpError(500, `The contract names no navigation for the items tab ${missing.tab}.`);
  };

  return {
    mode: 'odata',
    async load(actor) {
      const read = async (table: string) => [table, (await readAll(settings, sapOf(actor), service, contract.tables[table].entitySet, { pageSize: contract.pageSize })).map(r => toApp(table, r))] as const;
      // Large tables are paged by SAP (query), never loaded whole.
      const [first, ...rest] = Object.keys(contract.tables).filter(t => !tables[t]?.large);
      if (!first) return { tables: {}, lookups: await readLookups(actor) };
      // One read first: if SAP rejects the account, stop before firing the others.
      const head = await read(first);
      const [others, lookups] = await Promise.all([Promise.all(rest.map(read)), readLookups(actor)]);
      return { tables: Object.fromEntries([head, ...others]), lookups };
    },
    lookups: readLookups,
    async query(actor, table, list, q) {
      const entitySet = contract.tables[table].entitySet;
      let query = listODataQuery(list, q, { prop: f => prop(table, f), numbers, flagType: contract.flagType }).toString();
      const rows: Row[] = [];
      let total: number | null = null;
      // SAP may still page a large $top itself (@odata.nextLink): follow it until the page is full.
      for (let n = 0; query && n < 20 && rows.length < q.pageSize; n++) {
        const r = await sapRequest(settings, sapOf(actor), service, { path: entitySet, query });
        if (r.status === 401) throw new HttpError(502, REJECTED_MESSAGE);
        if (r.status >= 400) throw new HttpError(502, `${entitySet}: ${sapErrorMessage(r.status, r.text)}`);
        const data = jsonOf(r.text, entitySet);
        const count = data['@odata.count'];
        if (total === null && typeof count === 'number') total = count;
        else if (total === null && typeof count === 'string' && /^\d+$/.test(count)) total = Number(count);
        rows.push(...rowsOf(data).map(x => toApp(table, x)));
        query = nextQuery(data);
      }
      // Still short of the page with a next link pending after 20 reads: refuse rather than return a cut-off page.
      if (query && rows.length < q.pageSize) throw new HttpError(502, `${entitySet}: SAP returned more pages than expected. Narrow the selection.`);
      return { rows: rows.slice(0, q.pageSize), total: total ?? (q.page - 1) * q.pageSize + rows.length, page: q.page, pageSize: q.pageSize };
    },
    async readKeys(actor, table, keys) {
      const info = tables[table];
      if (!info || !keys.length) return [];
      const out: Row[] = [];
      for (let i = 0; i < keys.length; i += KEY_CHUNK) {
        const filter = keys.slice(i, i + KEY_CHUNK)
          .map(k => `(${info.keys.map(f => `${prop(table, f)} eq ${keyLiteral(f, k[f] ?? '')}`).join(' and ')})`).join(' or ');
        out.push(...(await readAll(settings, sapOf(actor), service, contract.tables[table].entitySet, { filter, pageSize: contract.pageSize })).map(r => toApp(table, r)));
      }
      return out;
    },
    async readObject(actor, spec, key) {
      assertNavigations(spec);
      const entitySet = contract.tables[spec.table].entitySet;
      const expand = spec.items.map(i => i.navigation);
      const r = await sapRequest(settings, sapOf(actor), service, { path: headerPath(spec, key), query: expand.length ? new URLSearchParams({ $expand: expand.join(',') }).toString() : undefined });
      if (r.status === 404) return null;
      if (r.status === 401) throw new HttpError(502, REJECTED_MESSAGE);
      if (r.status >= 400) throw new HttpError(502, `${entitySet}: ${sapErrorMessage(r.status, r.text)}`);
      const data = jsonOf(r.text, entitySet);
      // SAP may page an expanded collection: never show (and save against) part of the items.
      const paged = spec.items.find(i => data[`${i.navigation}@odata.nextLink`] !== undefined);
      if (paged) throw new HttpError(502, `${entitySet}: SAP returned only part of the ${paged.tab} items. Raise the service's page size for ${paged.navigation}.`);
      const listOf = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return { header: toApp(spec.table, data), items: Object.fromEntries(spec.items.map(i => [i.tab, listOf(data[i.navigation]).map(x => toApp(i.table, x))])) };
    },
    async writeObject(actor, spec, w) {
      assertNavigations(spec);
      const key = pick(w.key, spec.keys);
      const ops: BatchOp[] = [];
      // 'parent' (RAP `etag dependent by _Parent`): items share the header's ETag, and every operation of the changeset
      // changes it. So only the first conditional operation checks the ETag the person saw; the later ones send '*'.
      // Gap: a save that only adds items has no conditional operation; it relies on the compare before the batch
      // (in the module's queue) alone.
      const parentEtag = contract.object?.itemEtag === 'parent';
      let checked = false;
      const conditional = (own?: string) => {
        if (!parentEtag) return ifMatch(own);
        const first = !checked;
        checked = true;
        return ifMatch(first ? w.etag : undefined);
      };
      if (w.op === 'create') {
        const body = bodyOf(spec.table, w.header);
        // Deep insert: the items travel inside their header.
        for (const i of spec.items) body[i.navigation] = w.items.filter(c => c.tab === i.tab).map(c => itemBody(i, c.data));
        ops.push({ method: 'POST', path: contract.tables[spec.table].entitySet, body });
      } else if (w.op === 'delete') {
        // RAP deletes the items with their header.
        ops.push({ method: 'DELETE', path: headerPath(spec, key), etag: conditional(w.etag) });
      } else {
        // The header goes first: its If-Match (the ETag the person saw) is checked before any item changes.
        if (Object.keys(w.header).length) ops.push({ method: 'PATCH', path: headerPath(spec, key), body: bodyOf(spec.table, w.header), etag: conditional(w.etag) });
        for (const c of w.items) if (!spec.items.some(x => x.tab === c.tab)) throw new HttpError(400, `Unknown items tab ${c.tab}.`);
        const ORDER = { delete: 0, update: 1, create: 2 } as const;
        for (const i of spec.items) {
          // Per tab: deletes before updates before creates (a freed key can be used again in the same save).
          for (const c of w.items.filter(x => x.tab === i.tab).sort((a, b) => ORDER[a.op] - ORDER[b.op])) {
            // Item POSTs never carry If-Match; item PATCH/DELETE send the item's ETag from the fresh server read ('own').
            if (c.op === 'create') ops.push({ method: 'POST', path: `${headerPath(spec, key)}/${i.navigation}`, body: itemBody(i, c.data) });
            else ops.push({ method: c.op === 'update' ? 'PATCH' : 'DELETE', path: keyPath(i.table, pick({ ...key, ...c.key }, i.keys)), body: c.op === 'update' ? bodyOf(i.table, c.data) : undefined, etag: conditional(c.etag) });
          }
        }
      }
      if (!ops.length) return key;
      const answer = await sendBatch(actor, ops);
      // keyBySap: the created entity in the answer carries the key SAP assigned.
      const created = w.op === 'create' ? answer.bodies[0] : null;
      return created ? pick(toApp(spec.table, created), spec.keys) : key;
    },
    async action(actor, spec, key, etag, name) {
      await sendBatch(actor, [{ method: 'POST', path: `${headerPath(spec, key)}/${name}`, body: {}, etag: ifMatch(etag) }]);
    },
    async apply(actor, table, ops) {
      if (!ops.length) return;
      if (ops.length === 1) {
        const r1 = request(table, ops[0]);
        const r = await sapRequest(settings, sapOf(actor), service, { method: r1.method, path: r1.path, body: r1.body === undefined ? undefined : JSON.stringify(r1.body), etag: r1.etag });
        if (r.status >= 400) fail(r.status, sapErrorMessage(r.status, r.text), ops[0].id);
        return;
      }
      // Several rows: one $batch changeset, so SAP saves all of them or none.
      await sendBatch(actor, ops.map(o => request(table, o)));
    }
  };
}
