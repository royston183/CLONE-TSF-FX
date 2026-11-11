import { DataTable, columnsFor } from '@tsfx/components/table/DataTable';
import { StatusValue } from '@tsfx/components/ui/StatusValue';
// src/components/object/ObjectEditor.tsx
import { createElement, Fragment, useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react';
import { AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { objectAction, objectRead, objectWrite } from '@tsfx/lib/client/data';
import type { HttpError } from '@tsfx/lib/errors';
import { alignClass, alignOf, behaviourOf, cleanValues, formatField, labelOf, typeOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import { changedFromDefaults, gridRowsOf, problemsByGrid, rowsOfGrid } from '@tsfx/lib/grid/edit-rows';
import type { GridRow, Row } from '@tsfx/lib/grid/types';
import {
  checkObject, detailsToProblems, diffObject, emptyProblems, hasProblems, headerFields, initialHeader, isUnchanged, itemsSummary, itemsTabs, keyText,
  lockedHeader, nextItemValues, type ObjectData
} from '@tsfx/lib/object/object';
import type { AnyObjectDef, ObjectProblems, OpenMode } from '@tsfx/modules/types';
import { FieldControl } from '@tsfx/components/fields/FieldControl';
import { AmountValue } from '@tsfx/components/fields/AmountValue';
import { FieldGroup, FormGrid } from '@tsfx/components/fields/FormGrid';
import { EditGrid } from '@tsfx/components/grid/EditGrid';
import { ConfirmDialog } from '@tsfx/components/ui/ConfirmDialog';
import { FormDialog } from '@tsfx/components/ui/FormDialog';
import { Loading } from '@tsfx/components/ui/Loading';
import { Modal } from '@tsfx/components/ui/Modal';
import { Notice } from '@tsfx/components/ui/Notice';
import { DisplayValue, ObjectDialog, ObjectFrame, type ObjectDialogTab } from '@tsfx/components/ui/ObjectDialog';
import { ReviewDialog } from '@tsfx/components/ui/ReviewDialog';
import { ValueHelpDialog } from '@tsfx/components/ui/ValueHelpDialog';
import { gridRow } from '@tsfx/components/workbench/GridEditor';

/** An object as the API returns it; the header carries its ETag (__etag). */
export interface StoredObject extends ObjectData { unchanged?: boolean }
/** What the page may ask of an open pop-up (browser Back while it holds unsaved changes). */
export interface ObjectEditorControl { isDirty: () => boolean; askDiscard: () => void }
type Mode = 'display' | 'edit' | 'create';
type Draft = { header: Row; items: Record<string, GridRow[]> };
type Step = null | 'review' | 'discard-close' | 'discard-edit' | 'delete' | { action: string };
/** The frame a record shows in: a wizard only guides creating and editing, so a record shown for reading is a page. */
export const frameOf = (frame: OpenMode, mode: Mode): OpenMode => (frame === 'wizard' && mode === 'display' ? 'page' : frame);
interface ServerProblem { problems: ObjectProblems; message: string; conflict: boolean }

/** The same field as a SAP-style read-only box. */
const asDisplay = (d: AnyField): AnyField => typeOf(d) === 'amount'
  ? { ...d, computed: d.computed ?? ((row: Row) => row[d.field] ?? '') }
  : { ...d, type: 'display', computed: (row: Row, lk: unknown) => formatField(d, row, lk) };
const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.map(k => [k, row[k] ?? '']));

/** "2 changes · 1 field to fix": what the edit footer says while the record is being changed. */
export function editHint(changes: number, toFix: number): string {
  const parts = [changes ? `${changes} ${changes === 1 ? 'change' : 'changes'}` : 'No changes yet', toFix ? `${toFix} ${toFix === 1 ? 'field' : 'fields'} to fix` : 'Ctrl+S saves'];
  return parts.join(' · ');
}

/**
 * The pop-up's action buttons, every one in the footer (Modal), in view while the tabs scroll. Display: Delete and the
 * object's actions on the left, Close and Edit (primary) on the right; edit and create: the change count and the fields
 * to fix, Cancel, and Save (disabled while a field needs fixing).
 */
export function objectFooter({ def, header, mode, busy, changes = 0, toFix = 0, hidePrimary = false, on }: {
  def: AnyObjectDef; header: Row; mode: Mode; busy: boolean; changes?: number; toFix?: number;
  /** A wizard before its last step: no Save yet. */
  hidePrimary?: boolean;
  on: { close: () => void; edit: () => void; delete: () => void; action: (id: string) => void; cancel: () => void; save: () => void };
}): { footer: ReactNode; footerStart?: ReactNode } {
  if (mode !== 'display') return {
    footer: <>
      <span className={`ds-foot-hint ${toFix ? 'bad' : ''}`}>{editHint(changes, toFix)}</span>
      <button className="button secondary" disabled={busy} onClick={on.cancel}>Cancel</button>
      {!hidePrimary && <button className="button" disabled={busy || toFix > 0} onClick={on.save}>{busy ? 'Saving…' : mode === 'create' ? `Create ${def.noun[0]}` : 'Save'}</button>}
    </>
  };
  const actions = (def.actions ?? []).filter(a => !a.when || a.when(header));
  return {
    footerStart: <>
      {def.canDelete !== false && (!def.deletableWhen || def.deletableWhen(header)) && <button className="button secondary danger" onClick={on.delete}><Trash2 size={15} />Delete</button>}
      {actions.map(a => <button key={a.id} className={`button secondary ${a.danger ? 'danger' : ''}`} onClick={() => on.action(a.id)}>{a.label}</button>)}
    </>,
    footer: <>
      <button className="button secondary" onClick={on.close}>Close</button>
      {def.canEdit !== false && (!def.editableWhen || def.editableWhen(header)) && <button className="button" onClick={on.edit}><Pencil size={15} />Edit</button>}
    </>
  };
}

/** The pop-up of one object: display, edit (header form + item grids), create, delete and actions (spec §4.3). */
export function ObjectEditor({ def, lk, objectKey, frame, onClose, onSaved, onDeleted, onAction, handle }: {
  def: AnyObjectDef; lk: unknown;
  /** How the record opens (the module's `opens`): a pop-up, a page in place of the list, or a wizard. */
  frame: OpenMode;
  /** null: a new object. */
  objectKey: Row | null;
  onClose: () => void;
  onSaved: (obj: StoredObject, created: boolean) => void;
  onDeleted: () => void;
  onAction: (label: string) => void;
  /** Filled with isDirty / askDiscard for the page's history guard. */
  handle?: Ref<ObjectEditorControl | null>;
}) {
  const creating = objectKey === null;
  const noun = def.noun[0];
  const hdefs = useMemo(() => headerFields(def), [def]);
  const tabs = useMemo(() => itemsTabs(def), [def]);
  // A new object's defaults, taken once: later lookups must not make the untouched form look changed.
  const [defaults] = useState<Row>(() => (creating ? def.defaults?.(lk) ?? {} : {}));
  // Header fields the server sets on create (initial): left out of the create form, and its checks see them set.
  const [preset] = useState<Row>(() => (creating ? initialHeader(def) : {}));
  const [loaded, setLoaded] = useState<{ obj: StoredObject | null; error: string }>(() => ({ obj: creating ? { header: defaults, items: {} } : null, error: '' }));
  const [mode, setMode] = useState<Mode>(creating ? 'create' : 'display');
  const [draft, setDraft] = useState<Draft | null>(() => (creating ? { header: { ...defaults }, items: {} } : null));
  const [tried, setTried] = useState(false);
  // Fields the person changed in create mode: their problems show at once; the others once Save was tried.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [server, setServer] = useState<ServerProblem | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<AnyField | null>(null);
  const [reload, setReload] = useState(0);

  const keyJson = objectKey ? JSON.stringify(objectKey) : '';
  useEffect(() => {
    if (!keyJson) return;
    let live = true;
    objectRead(def.id, JSON.parse(keyJson)).then(
      obj => { if (live) setLoaded({ obj, error: '' }); },
      (e: Error) => { if (live) setLoaded({ obj: null, error: e.message }); }
    );
    return () => { live = false; };
  }, [def.id, keyJson, reload]);

  const obj = loaded.obj;
  const grids = useMemo(() => Object.fromEntries(tabs.map(t => [t.id, rowsOfGrid(t.grid, draft?.items[t.id] ?? [])])), [tabs, draft]);
  const data = useMemo<ObjectData | null>(() => (draft ? { header: cleanValues(hdefs, draft.header), items: Object.fromEntries(tabs.map(t => [t.id, grids[t.id].rows])) } : null), [draft, hdefs, tabs, grids]);
  const local = useMemo(() => (!data || mode === 'display' ? emptyProblems()
    : mode === 'create' ? checkObject(def, { ...data, header: { ...data.header, ...preset } }, lk, 'create')
    : checkObject(def, data, lk, 'edit')), [data, def, lk, mode, preset]);
  const diff = useMemo(() => (obj && data && mode === 'edit' ? diffObject(def, obj, data) : null), [obj, data, def, mode]);
  const dirty = mode === 'edit' ? Boolean(diff && !isUnchanged(diff))
    : mode === 'create' ? Boolean(data && changedFromDefaults(hdefs, defaults, data.header, data.items))
    : false;

  useImperativeHandle(handle, () => ({ isDirty: () => dirty, askDiscard: () => { setHelp(null); setStep('discard-close'); } }), [dirty]);
  // Reload or tab close with unsaved changes asks the browser's own question.
  useEffect(() => {
    if (!dirty) return;
    const stay = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', stay);
    return () => removeEventListener('beforeunload', stay);
  }, [dirty]);

  const headerError = (d: AnyField): string | undefined => {
    for (const f of [d.field, d.toField, d.yearField]) {
      if (!f) continue;
      const p = server?.problems.header[f] || (tried || mode === 'edit' || touched.has(f) ? local.header[f] : '');
      if (p) return p;
    }
    return undefined;
  };
  const itemProblems = (tab: string) => problemsByGrid([...(tried || mode === 'edit' ? local.items[tab] ?? [] : []), ...(server?.problems.items[tab] ?? [])], grids[tab]?.index ?? []);
  const clearServer = () => setServer(s => (s?.conflict ? s : null));
  const setHeader = (field: string, value: string) => { setDraft(d => (d ? { ...d, header: { ...d.header, [field]: value } } : d)); setTouched(t => new Set(t).add(field)); clearServer(); };
  const setItems = (tab: string, rows: GridRow[]) => { setDraft(d => (d ? { ...d, items: { ...d.items, [tab]: rows } } : d)); clearServer(); };
  const objKey = obj ? pick(obj.header, def.list.keys) : {};
  const etag = obj?.header.__etag ?? '';

  function startEdit() {
    if (!obj) return;
    setDraft({ header: { ...obj.header }, items: Object.fromEntries(tabs.map(t => [t.id, gridRowsOf(t.grid, obj.items[t.id] ?? [], gridRow)])) });
    setMode('edit');
    setTried(false);
    setServer(null);
  }
  function leaveEdit() { setMode('display'); setDraft(null); setTried(false); setTouched(new Set()); setServer(null); setStep(null); }
  const requestClose = () => (dirty ? setStep('discard-close') : onClose());
  const requestCancel = () => (creating ? requestClose() : dirty ? setStep('discard-edit') : leaveEdit());
  const reloadObject = () => { leaveEdit(); setReload(n => n + 1); };
  /** A refused write: its problems show on the record (an action's form stays open with them when `keep`). */
  const failed = (error: unknown, keep = false) => {
    const e = error as HttpError;
    if (!keep) setStep(null);
    setServer({ problems: detailsToProblems(e.details ?? []), message: e.message, conflict: e.status === 409 });
  };
  function save() {
    setTried(true);
    if (!data || busy || hasProblems(local)) return;
    if (mode === 'create') void send();
    else if (dirty) setStep('review');
    else leaveEdit();
  }
  async function send() {
    if (!data) return;
    const created = mode === 'create';
    setBusy(true);
    try {
      const saved: StoredObject = await objectWrite(def.id, created ? 'create' : 'update', created ? { ...data } : { key: objKey, etag, ...data });
      setLoaded({ obj: saved, error: '' });
      leaveEdit();
      onSaved(saved, created);
    } catch (error) { failed(error); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await objectWrite(def.id, 'delete', { key: objKey, etag }); setStep(null); onDeleted(); }
    catch (error) { failed(error); } finally { setBusy(false); }
  }
  /** Runs an action; `values`: what its input form gave (sent along, and the form stays open when it is refused). */
  async function act(id: string, label: string, values?: Row) {
    setBusy(true);
    try {
      const after = await objectAction(def.id, id, values ? { key: objKey, etag, values } : { key: objKey, etag });
      setLoaded({ obj: after, error: '' });
      setStep(null);
      setServer(null);
      onAction(label);
    } catch (error) { failed(error, Boolean(values)); } finally { setBusy(false); }
  }

  const shownFrame = frameOf(frame, mode);
  if (!obj) {
    const state = loaded.error ? <Notice error><AlertCircle size={16} />{loaded.error}</Notice> : <Loading text={`Loading ${noun.toLowerCase()}…`} />;
    const [title, close] = [loaded.error ? 'not available' : keyText(def.list.keys, objectKey ?? {}), <button key="close" className="button secondary" onClick={onClose}>Close</button>];
    return shownFrame === 'popup'
      ? <Modal variant="record" eyebrow={noun} title={title} onClose={onClose} footer={close}><div className="kit-record-panel">{state}</div></Modal>
      : <ObjectFrame frame={shownFrame} eyebrow={noun} title={title} facts={[]} notice={state} steps={[]} tab="" onTab={() => undefined} footer={close} onClose={onClose} />;
  }

  const editing = mode !== 'display';
  const shown = editing && draft ? draft.header : obj.header;
  const key = keyText(def.list.keys, obj.header);
  /** A field as the record shows it: its text (a link or a status tag where it is one), '' when empty (shown as —). */
  const value = (d: AnyField, row: Row): ReactNode => {
    const t = d.shown ? d.shown(row, lk) : formatField(d, row, lk);
    if (typeOf(d) === 'amount' && t && !d.statusTone) return <AmountValue value={d.computed ? d.computed(row, lk) : row[d.field] ?? ''} label={labelOf(d)} scale={d.scale} currency={d.currencyField ? row[d.currencyField] : undefined} />;
    return t ? <StatusValue definition={d} row={row}>{t}</StatusValue> : '';
  };
  const statusField = hdefs.find(d => d.statusTone);
  const statusText = !statusField ? '' : statusField.shown ? statusField.shown(obj.header, lk) : formatField(statusField, obj.header, lk);
  const status = mode === 'edit' ? <span className="kit-tag">Editing</span> : mode === 'create' ? <span className="kit-tag">New</span>
    : statusField && statusText ? <StatusValue definition={statusField} row={obj.header}>{statusText}</StatusValue> : undefined;
  // Fields the stored record locks (lockedFields and the fields `initial` sets; a range or period by either of its
  // fields): read-only while editing, changed only by actions.
  const lockedNow = mode === 'edit' ? lockedHeader(def, obj.header) : [];
  const isLocked = (d: AnyField) => [d.field, d.toField, d.yearField].some(f => f && lockedNow.includes(f));
  const lockHint = (d: AnyField) => (mode === 'edit' && d.key ? (def.keyBySap ? 'Set by SAP; cannot change' : 'The key of the record; cannot change')
    : isLocked(d) ? `Cannot change for this ${noun.toLowerCase()} now` : undefined);
  const onForm = (d: AnyField) => !(mode === 'create' && Object.hasOwn(preset, d.field));
  const control = (d: AnyField) => (
    <FieldControl key={d.field} def={d} variant="form" row={shown} lk={lk} readOnly={mode === 'edit' && (Boolean(d.key) || isLocked(d))} hint={lockHint(d)} error={headerError(d)}
      onChange={setHeader} onValueHelp={d.valueHelp && d.lookup ? () => setHelp(d) : undefined} />
  );
  // A field that cannot be typed into while editing (computed, display) keeps its value in a read-only box.
  const locked = (d: AnyField) => <FieldControl key={d.field} def={asDisplay(d)} variant="form" row={shown} lk={lk} hint={d.computed ? 'Calculated' : undefined} onChange={() => undefined} />;
  const editable = (d: AnyField) => editing && !d.computed && typeOf(d) !== 'display';
  const head = editing ? <FormGrid columns={2}>{def.header.filter(d => !(mode === 'create' && def.keyBySap && d.key) && onForm(d)).map(control)}</FormGrid> : undefined;
  const list = (fields: AnyField[]) => (
    <dl className="kit-dl">{fields.map(d => <Fragment key={d.field}><dt>{labelOf(d)}</dt><dd className={behaviourOf(d).align === 'right' ? 'kit-num' : undefined}><DisplayValue>{value(d, shown)}</DisplayValue></dd></Fragment>)}</dl>
  );

  // The first tab holds the header form while editing, so a header field's problem marks it too.
  const headBad = editing && def.header.some(d => Boolean(headerError(d)));
  const tabContent: ObjectDialogTab[] = def.tabs.map((t, i) => {
    if (t.kind === 'fields') {
      return {
        id: t.id, label: t.label, bad: (i === 0 && headBad) || (editing && t.groups.some(g => g.fields.some(d => Boolean(headerError(d))))),
        content: <div className="kit-groups">{t.groups.map(g => (
          <FieldGroup key={g.title} title={g.title}>
            {editing ? <FormGrid columns={g.columns ?? 1}>{g.fields.filter(onForm).map(d => (editable(d) ? control(d) : locked(d)))}</FormGrid> : list(g.fields)}
          </FieldGroup>
        ))}</div>
      };
    }
    if (t.kind === 'items') {
      const rows = obj.items[t.id] ?? [];
      if (editing && draft && t.editable !== false) {
        const problems = itemProblems(t.id);
        return {
          id: t.id, label: t.label, bad: Object.keys(problems).length > 0,
          content: <EditGrid fields={t.grid} rows={draft.items[t.id] ?? []} lk={lk} ariaLabel={t.label} problems={problems} onRows={next => setItems(t.id, next)}
            newRow={(current, offset) => gridRow(nextItemValues(def, t, current.map(r => r.values), offset))} />
        };
      }
      return {
        id: t.id, label: t.label, empty: !rows.length,
        content: rows.length
          ? <div className="kit-table-card"><DataTable columns={columnsFor(t.columns, t.grid)} className="ds-table" aria-label={t.label}>
            <thead><tr>{t.columns.map(c => <th key={c.field} className={alignClass(alignOf(c.field, t.grid, c.align)) || undefined}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map(r => <tr key={keyText(t.keys, r)}>{t.columns.map(c => <td key={c.field} className={`${c.code ? 'ds-code' : ''} ${alignClass(alignOf(c.field, t.grid, c.align))}`}><StatusValue definition={c} row={r}>{c.text(r)}</StatusValue></td>)}</tr>)}</tbody>
          </DataTable></div>
          : <p className="kit-empty-note">No {t.label.toLowerCase()} yet.</p>
      };
    }
    return { id: t.id, label: t.label, content: createElement(t.component, { header: shown, items: obj.items, lk, mode, onHeader: setHeader }) };
  });

  // The edit footer counts the changes and the fields that need fixing (every problem, shown on its field or not yet).
  const startValues = cleanValues(hdefs, defaults);
  const changes = mode === 'edit' && diff ? Object.keys(diff.header).length + diff.items.length
    : mode === 'create' && data ? valueFields(hdefs).filter(d => (data.header[d.field] ?? '') !== (startValues[d.field] ?? '')).length + Object.values(data.items).reduce((n, r) => n + r.length, 0)
    : 0;
  const fieldProblems = Object.keys(local.header).length + Object.values(local.items).reduce((n, l) => n + l.length, 0);
  const toFix = editing ? fieldProblems || local.messages.length : 0;
  const footerOn = { close: onClose, edit: startEdit, delete: () => setStep('delete'), action: (id: string) => setStep({ action: id }), cancel: requestCancel, save };
  const { footer, footerStart } = objectFooter({ def, header: obj.header, mode, busy, changes, toFix, on: footerOn });
  const messages = [...(server?.problems.messages ?? []), ...(tried || mode === 'edit' ? local.messages : [])];
  const notice = server?.message || messages.length ? (
    <Notice error action={server?.conflict ? { label: 'Reload', onClick: reloadObject } : undefined}>
      <AlertCircle size={16} /><span>{server?.message ?? 'Some fields need attention.'}{messages.length > 0 && <ul>{messages.map(m => <li key={m}>{m}</li>)}</ul>}</span>
    </Notice>
  ) : null;
  const pending = step && typeof step === 'object' ? (def.actions ?? []).find(a => a.id === step.action) : undefined;

  return (
    <>
      <ObjectDialog key={shownFrame} frame={shownFrame} skip={stepId => def.kind === 'object' && Boolean(def.wizardSkip?.(stepId, shown))} eyebrow={mode === 'create' ? `New ${noun}` : mode === 'edit' ? `Edit ${noun}` : noun}
        title={mode === 'create' ? (def.keyBySap ? 'Not saved yet' : keyText(def.list.keys, shown) || 'Not saved yet') : key}
        status={status} subtitle={def.subtitle?.(obj.header, lk) ?? def.title}
        facts={editing ? [] : def.header.filter(d => d !== statusField).map(d => ({ label: labelOf(d), value: value(d, obj.header), num: behaviourOf(d).align === 'right' }))}
        head={head} notice={notice} tabs={tabContent} footer={shownFrame === 'wizard' ? ({ last }) => objectFooter({ def, header: obj.header, mode, busy, changes, toFix, hidePrimary: !last, on: footerOn }).footer : footer} footerStart={footerStart} busy={busy} onClose={requestClose} onPrimary={editing ? save : undefined} />
      {step === 'review' && data && diff && <ReviewDialog title={`Save ${noun} ${key}`} fields={hdefs} before={obj.header} after={data.header} lk={lk} busy={busy}
        summary={itemsSummary(def, diff)} onBack={() => setStep(null)} onConfirm={() => void send()} />}
      {(step === 'discard-close' || step === 'discard-edit') && <ConfirmDialog title="Discard changes?" message="Your changes are not saved yet." confirmLabel="Yes, Discard" danger
        onClose={() => setStep(null)} onConfirm={() => (step === 'discard-close' ? onClose() : leaveEdit())} />}
      {step === 'delete' && <ConfirmDialog title={`Delete ${noun}`} message={`Delete ${noun.toLowerCase()} ${key}? This cannot be undone.`} confirmLabel="Yes, Delete" danger busy={busy}
        onClose={() => setStep(null)} onConfirm={() => void remove()} />}
      {pending?.inputs?.length ? <FormDialog title={pending.label} subtitle={`${noun} ${key}`} fields={pending.inputs} initial={{}} lk={lk} busy={busy} saveLabel={pending.label}
        section={{ title: 'Details', description: pending.confirm }} check={pending.check ? values => pending.check?.(obj.header, values) ?? {} : undefined} serverErrors={server?.problems.header} serverMessage={server ? [server.message, ...server.problems.messages].join(' ') : undefined}
        onClose={() => { setStep(null); clearServer(); }} onSave={values => void act(pending.id, pending.label, values)} />
      : pending && <ConfirmDialog title={pending.label} message={pending.confirm} confirmLabel={`Yes, ${pending.label}`} danger={pending.danger} busy={busy}
        onClose={() => setStep(null)} onConfirm={() => void act(pending.id, pending.label)} />}
      {help?.lookup && draft && <ValueHelpDialog title={`Select ${labelOf(help)}`} items={help.lookup(lk, draft.header)} onClose={() => setHelp(null)}
        onPick={code => { setHeader(help.field, code); setHelp(null); }} />}
    </>
  );
}
