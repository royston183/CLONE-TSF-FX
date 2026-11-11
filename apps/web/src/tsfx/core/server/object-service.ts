import { checkFields, cleanValues, labelOf, problemText, typeOf, valueFields } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';
import { checkObject, cleanObject, diffObject, hasProblems, headerFields, initialHeader, isUnchanged, itemsTabs, keyText, lockedHeader, ownKeys, problemsToDetails, savedObject } from '@tsfx/lib/object/object';
import { HttpError } from '@tsfx/lib/errors';
import { contractOf } from '@tsfx/modules/tables';
import type { AnyObjectDef, ObjectAction, ObjectProblems, ODataContract } from '@tsfx/modules/types';
import type { ObjectSpec, StoredObject } from './backend';
import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { backendFor, moduleEntry, serial } from './module-service';
import { CONFLICT_MESSAGE } from './backend';
import type { Actor } from '../actor';

/**
 * Where an object module's data lives. A contract with `object` names the navigation of every items tab (never guessed);
 * without it the module runs only on a local store (sample data in memory, or the application's own data), and the
 * OData backend (SAP through the relay) refuses objects.
 */
export function objectSpec(def: AnyObjectDef, contract: ODataContract): ObjectSpec {
  return {
    table: def.list.entity, keys: def.list.keys,
    items: itemsTabs(def).map(t => {
      const navigation = contract.object?.items[t.id]?.navigation ?? '';
      if (contract.object && !navigation) throw new HttpError(500, `The contract of ${def.id} names no navigation for the items tab ${t.id}.`);
      return { tab: t.id, table: t.table, keys: t.keys, navigation, ...(t.keyBySap ? { keyBySap: true } : {}) };
    })
  };
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const seenEtag = (input: Record<string, unknown>) => (typeof input.etag === 'string' ? input.etag : '');

/** Object pages (spec §4.4): every write re-reads the object, re-checks it, plans the changes and sends one $batch. */
export function objectService(cfg: AppConfig, id: string) {
  const entry = moduleEntry(cfg, id);
  if (entry.def.kind !== 'object') throw new HttpError(404, 'Unknown application.');
  // Typed explicitly: the hoisted helpers below do not see the narrowing above.
  const def: AnyObjectDef = entry.def;
  const backend = backendFor(id, entry);
  const spec = objectSpec(def, contractOf(entry));
  const noun = def.noun[0];
  const keyDefs = def.list.keys.map(k => [...headerFields(def), ...def.list.fields].find(d => d.field === k) ?? { field: k, label: k });
  // The key's type check (whole number, date, length): option lists need the lookups, and their values travel quoted anyway.
  const typedKeys = keyDefs.filter(d => !['select', 'segmented', 'period', 'suggest', 'multiSelect'].includes(typeOf(d)));
  const queue = <T>(task: () => Promise<T>) => serial(`${id}|${backend.mode}`, task);
  const lookups = async (actor: Actor) => def.lookups(await backend.lookups(actor));
  const invalid = (details: ReturnType<typeof problemsToDetails>) => new HttpError(422, 'Some fields need attention.', details);

  /** The object key from a request: every key field present, cleaned and checked by its type (never sent to SAP otherwise). */
  function keyOf(raw: unknown): Row {
    const input = asRecord(raw);
    if (def.list.keys.some(k => typeof input[k] !== 'string')) throw new HttpError(400, `Give the ${noun.toLowerCase()} key.`);
    const key = cleanValues(keyDefs, input);
    if (def.list.keys.some(k => !key[k])) throw new HttpError(400, `Give the ${noun.toLowerCase()} key.`);
    const bad = Object.entries(checkFields(typedKeys, key, {})).find(([, p]) => p);
    if (bad) throw new HttpError(400, problemText(typedKeys, bad[0], bad[1]));
    return key;
  }
  async function mustRead(actor: Actor, key: Row): Promise<StoredObject> {
    const found = await backend.readObject(actor, spec, key);
    if (!found) throw new HttpError(404, `${noun} ${keyText(def.list.keys, key)} no longer exists.`);
    return found;
  }
  /**
   * Someone saved the object after the person opened it: refuse before anything is sent (again on every retry).
   * A write without the ETag the person saw would skip this check, so it is refused too.
   */
  function assertFresh(stored: StoredObject, seen: string) {
    if (!stored.header.__etag) return;
    if (!seen) throw new HttpError(400, 'Refresh and try again.');
    if (seen !== stored.header.__etag) throw new HttpError(409, CONFLICT_MESSAGE);
  }
  /**
   * An edit as the update path saves it (also an action's `apply`): checked like any save, then only the changes are
   * written with the ETag the person saw. `refuse` turns the problems into the error; `actionItems`: an action's
   * applyItems (tab id → every row), saved in the same write.
   */
  async function saveEdit(actor: Actor, key: Row, stored: StoredObject, input: Record<string, unknown>, refuse = (p: ObjectProblems) => invalid(problemsToDetails(p)), actionItems: Record<string, Row[]> = {}) {
    // Items tabs that are not editable, or missing from the save, keep their stored items: the server decides.
    const data = savedObject(def, stored, input);
    // An action's applyItems replaces its tabs, editable or not (the server built them, never the browser).
    // A tab whose value is not a list of rows is left as it is.
    for (const t of itemsTabs(def)) if (Object.hasOwn(actionItems, t.id) && Array.isArray(actionItems[t.id])) data.items[t.id] = actionItems[t.id].map(r => cleanValues(t.grid, r));
    const after = { header: { ...data.header, ...key }, items: data.items };
    // Check first: the diff relies on unique item keys and cleaned values.
    const problems = checkObject(def, after, await lookups(actor), 'edit');
    if (hasProblems(problems)) throw refuse(problems);
    const diff = diffObject(def, stored, after);
    if (isUnchanged(diff)) return { ...stored, unchanged: true as const };
    await backend.writeObject(actor, spec, { op: 'update', key, etag: seenEtag(input) || stored.header.__etag, header: diff.header, items: diff.items });
    return mustRead(actor, key);
  }
  /** The values of an action's inputs, cleaned and checked by their fields (422 on the field, before anything runs). */
  async function actionValues(actor: Actor, action: ObjectAction, raw: unknown): Promise<Row> {
    if (!action.inputs?.length) return {};
    const values = cleanValues(action.inputs, raw);
    const bad = Object.entries(checkFields(action.inputs, values, await lookups(actor))).filter(([, p]) => p);
    if (bad.length) throw invalid(bad.map(([field, p]) => ({ field, message: problemText(action.inputs ?? [], field, p) })));
    return values;
  }
  /** The action's own rules on its inputs against the stored header (the same rules its input form runs): 422 on the field. */
  function checkAction(action: ObjectAction, header: Row, values: Row) {
    const bad = Object.entries(action.check?.(header, values) ?? {}).filter(([, m]) => m);
    if (bad.length) throw invalid(bad.map(([field, message]) => ({ field, message })));
  }
  /** An edit that changes a field the stored record locks (lockedFields, and every field `initial` sets) is refused on that field (422). */
  function assertUnlocked(stored: StoredObject, input: Record<string, unknown>) {
    const locked = lockedHeader(def, stored.header);
    if (!locked.length) return;
    const fields = valueFields(headerFields(def));
    const now = cleanValues(fields, input.header), before = cleanValues(fields, stored.header);
    const changed = fields.filter(d => locked.includes(d.field) && now[d.field] !== before[d.field]);
    if (changed.length) throw invalid(changed.map(d => ({ field: d.field, message: `${labelOf(d)} cannot be changed for this ${noun.toLowerCase()} now.` })));
  }

  return {
    read: async (actor: Actor, rawKey: unknown) => mustRead(actor, keyOf(rawKey)),

    create: (actor: Actor, input: Record<string, unknown>) => queue(async () => {
      if (def.canCreate === false) throw new HttpError(403, `New ${def.noun[1].toLowerCase()} cannot be created here.`);
      const data = cleanObject(def, input);
      // Fields the server sets (initial) win over what was typed, and the checks see them: a required one is never missing.
      Object.assign(data.header, initialHeader(def));
      const problems = checkObject(def, data, await lookups(actor), 'create');
      if (hasProblems(problems)) throw invalid(problemsToDetails(problems));
      const key: Row = def.keyBySap ? {} : Object.fromEntries(def.list.keys.map(k => [k, data.header[k] ?? '']));
      if (!def.keyBySap && await backend.readObject(actor, spec, key)) {
        throw invalid([{ field: def.list.keys[0], message: `${noun} ${keyText(def.list.keys, key)} already exists.` }]);
      }
      // keyBySap: SAP numbers the object, so the (empty) key fields are never sent; otherwise the typed keys travel in the body.
      const header = def.keyBySap ? Object.fromEntries(Object.entries(data.header).filter(([f]) => !def.list.keys.includes(f))) : data.header;
      const items = itemsTabs(def).flatMap(t => (data.items[t.id] ?? []).map(row => ({ tab: t.id, op: 'create' as const, key: Object.fromEntries(ownKeys(def, t).map(k => [k, row[k] ?? ''])), data: row })));
      const saved = await backend.writeObject(actor, spec, { op: 'create', key, header, items });
      if (def.list.keys.some(k => !saved[k])) throw new HttpError(502, `SAP saved the ${noun.toLowerCase()} but did not return its key. Refresh the list to find it.`);
      return mustRead(actor, saved);
    }),

    update: (actor: Actor, input: Record<string, unknown>): Promise<StoredObject & { unchanged?: true }> => queue(async () => {
      if (def.canEdit === false) throw new HttpError(403, `${def.noun[1]} cannot be changed here.`);
      const key = keyOf(input.key);
      // Never trust the browser's copy: plan against the object as stored now.
      const stored = await mustRead(actor, key);
      assertFresh(stored, seenEtag(input));
      if (def.editableWhen && !def.editableWhen(stored.header)) throw new HttpError(422, `This ${noun.toLowerCase()} can no longer be changed.`);
      assertUnlocked(stored, input);
      return saveEdit(actor, key, stored, input);
    }),

    remove: (actor: Actor, input: Record<string, unknown>) => queue(async () => {
      if (def.canDelete === false) throw new HttpError(403, `${def.noun[1]} cannot be deleted here.`);
      const key = keyOf(input.key);
      const stored = await mustRead(actor, key);
      assertFresh(stored, seenEtag(input));
      if (def.deletableWhen && !def.deletableWhen(stored.header)) throw new HttpError(422, `This ${noun.toLowerCase()} cannot be deleted.`);
      await backend.writeObject(actor, spec, { op: 'delete', key, etag: seenEtag(input) || stored.header.__etag, header: {}, items: [] });
      return { deleted: true as const };
    }),

    action: (actor: Actor, actionId: string, input: Record<string, unknown>) => queue(async () => {
      const action = def.actions?.find(a => a.id === actionId);
      if (!action) throw new HttpError(404, 'Unknown action.');
      const key = keyOf(input.key);
      const stored = await mustRead(actor, key);
      assertFresh(stored, seenEtag(input));
      if (action.when && !action.when(stored.header)) throw new HttpError(422, `${action.label} is not possible for this ${noun.toLowerCase()} now.`);
      const values = await actionValues(actor, action, input.values);
      checkAction(action, stored.header, values);
      // The application's own data (and a REST data service) saves `apply` / `applyItems` like an edit; sample data runs it
      // only without a mock; SAP never.
      if ((action.apply || action.applyItems) && (entry.source === 'app' || entry.source === 'rest' || (!entry.source && !action.mock))) {
        const changed = action.apply?.(stored.header, values) ?? {};
        const saved = new Set(valueFields(headerFields(def)).map(d => d.field));
        const lost = Object.keys(changed).filter(f => !saved.has(f) && (changed[f] ?? '') !== (stored.header[f] ?? ''));
        if (lost.length) throw new HttpError(500, `${action.label} changes ${lost.join(', ')}, which the ${noun.toLowerCase()} does not save: add the field to its header or tabs.`);
        const refuse = (p: ObjectProblems) => new HttpError(422, `${action.label} would leave the ${noun.toLowerCase()} invalid.`, problemsToDetails(p).map(d => ({ message: d.message })));
        const items = asRecord(action.applyItems?.(stored.header, stored.items, values, actor.username)) as Record<string, Row[]>;
        return saveEdit(actor, key, stored, { etag: input.etag, header: { ...stored.header, ...changed } }, refuse, items);
      }
      const mock = action.mock;
      await backend.action(actor, spec, key, seenEtag(input) || stored.header.__etag, contractOf(entry).object?.actions?.[action.id] ?? action.sapAction, mock && (h => mock(h, values)));
      return mustRead(actor, key);
    })
  };
}

/** GET (read: ?key=<JSON>), POST (create), PATCH (update), DELETE /api/modules/:id/object. */
export async function objectRequest(req: Request, cfg: AppConfig, id: string, what: 'read' | 'create' | 'update' | 'delete'): Promise<Response> {
  if (what !== 'read') assertTrustedWrite(req, cfg);
  const actor = actorOf(req);
  const svc = objectService(cfg, id);
  if (what === 'read') {
    let key: unknown;
    try { key = JSON.parse(new URL(req.url).searchParams.get('key') ?? ''); } catch { throw new HttpError(400, 'Give the key as JSON.'); }
    return json(await svc.read(actor, key));
  }
  const input = await readJson(req, 4 * 1024 * 1024);
  if (what === 'create') return json(await svc.create(actor, input));
  if (what === 'update') return json(await svc.update(actor, input));
  return json(await svc.remove(actor, input));
}

/** POST /api/modules/:id/object/action/:action */
export async function objectActionRequest(req: Request, cfg: AppConfig, id: string, action: string): Promise<Response> {
  assertTrustedWrite(req, cfg);
  const actor = actorOf(req);
  return json(await objectService(cfg, id).action(actor, action, await readJson(req)));
}
