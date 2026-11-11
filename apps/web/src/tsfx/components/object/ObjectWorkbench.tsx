// src/components/object/ObjectWorkbench.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from '@tsfx/lib/client/nav';
import { AlertCircle, Plus, Server } from 'lucide-react';
import { moduleView, onSampleData, SAMPLE_DATA_NOTE, sourceLabel } from '@tsfx/lib/client/data';
import { DRILL_DROPPED, parseDrillParams } from '@tsfx/lib/drill/params';
import type { Row, View } from '@tsfx/lib/grid/types';
import { filterOp } from '@tsfx/lib/list/pagination';
import { isPushed, markState, setBackGuard } from '@tsfx/lib/object/history';
import { keyFromParam, keyText, openParam } from '@tsfx/lib/object/object';
import type { AnyObjectDef, OpenMode } from '@tsfx/modules/types';
import { LargeList } from '@tsfx/components/list/LargeList';
import { DrillFromBar } from '@tsfx/components/report/DrillFromBar';
import { Loading } from '@tsfx/components/ui/Loading';
import { Notice } from '@tsfx/components/ui/Notice';
import { TrafficLightTag } from '@tsfx/components/ui/Badge';
import { Toast, useToast } from '@tsfx/components/ui/Toast';
import { ObjectEditor, type ObjectEditorControl, type StoredObject } from './ObjectEditor';

/** How an open record shows: the module's `opens` for a new one or an existing one. A page or wizard takes the list's place. */
export const recordFrame = (def: AnyObjectDef, creating: boolean): OpenMode => (creating ? def.opens.create : def.opens.open);
export const hidesList = (frame: OpenMode): boolean => frame !== 'popup';

/**
 * The object page (spec §4.3): a large list; a row opens as a pop-up. Opening pushes `?open=<key>` (links open the
 * object, Back closes it); closing removes it. New opens the same pop-up in create mode, on its own history entry.
 * Back while the pop-up holds unsaved changes keeps it open and asks "Discard changes?" first.
 */
export default function ObjectWorkbench({ def }: { def: AnyObjectDef }) {
  const params = useSearchParams();
  const openValue = params.get('open');
  const openKey = keyFromParam(def.list.keys, openValue);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [viewError, setViewError] = useState('');
  const [version, setVersion] = useState(0);
  const [toast, notify] = useToast();
  const editor = useRef<ObjectEditorControl | null>(null);
  // The entry the pop-up lives on (restored when Back is refused) and whether our own close is going back.
  const here = useRef<{ state: unknown; url: string } | null>(null);
  const closing = useRef(false);
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);
  // A drill from another screen (spec §5.2): f.<field> starts the list filtered. A value that is not a declared filter
  // or not valid for its field is dropped with a notice, never sent on. The values are checked against the real
  // lookups, so a drilled list waits for them (the view) before it reads anything.
  const filterFields = useMemo(() => def.list.fields.filter(d => def.list.filters?.includes(d.field)), [def.list]);
  const drilling = [...params.keys()].some(k => k.startsWith('f.'));
  const ready = !drilling || Boolean(view) || Boolean(viewError);
  const drill = useMemo(() => parseDrillParams(params, 'f', filterFields, lk), [params, filterFields, lk]);
  const drillKey = JSON.stringify(drill.values);
  const initialValues = useMemo(() => Object.fromEntries(Object.entries(drill.values).map(([field, v]) => {
    const d = filterFields.find(x => x.field === field);
    return [field, d && filterOp(d) === 'between' ? [v, v] : [v]];
  })), [drill.values, filterFields]);

  useEffect(() => {
    let live = true;
    moduleView(def.id).then(v => { if (live) setView(v); }, (e: Error) => { if (live) setViewError(e.message); });
    return () => { live = false; };
  }, [def.id]);
  useEffect(() => {
    here.current = { state: window.history.state, url: window.location.href };
  }, [openValue, creating]);
  useEffect(() => {
    // The guard runs from the <head> hook (BACK_GUARD_SCRIPT), before Next.js's router listener, so a refused Back
    // never reaches the router.
    const pop = (e: PopStateEvent) => {
      if (closing.current) { closing.current = false; setCreating(false); return; }
      if (editor.current?.isDirty() && here.current) {
        e.stopImmediatePropagation();
        window.history.pushState(here.current.state, '', here.current.url);
        editor.current.askDiscard();
        return;
      }
      setCreating(false);
    };
    setBackGuard(pop);
    return () => setBackGuard(null);
  }, []);

  const urlFor = (row: Row | null) => {
    const p = new URLSearchParams(window.location.search);
    if (row) p.set('open', openParam(def.list.keys, row)); else p.delete('open');
    const q = p.toString();
    return `${window.location.pathname}${q ? `?${q}` : ''}`;
  };
  const open = (row: Row) => window.history.pushState(markState(window.history.state, 'objOpen'), '', urlFor(row));
  const create = () => { window.history.pushState(markState(window.history.state, 'objCreate'), '', urlFor(null)); setCreating(true); };
  const close = () => {
    setCreating(false);
    if (isPushed(window.history.state)) { closing.current = true; window.history.back(); }
    else window.history.replaceState(markState(window.history.state), '', urlFor(null));
  };
  const saved = (obj: StoredObject, created: boolean) => {
    setVersion(v => v + 1);
    notify(created ? `${def.noun[0]} ${keyText(def.list.keys, obj.header)} created` : `${def.noun[0]} saved`, 'success');
    // The new object's entry replaces the create entry: Close or Back from it returns to the list.
    if (created) { setCreating(false); window.history.replaceState(markState(window.history.state, 'objOpen'), '', urlFor(obj.header)); }
  };
  const deleted = () => { setVersion(v => v + 1); notify(`${def.noun[0]} deleted`, 'success'); close(); };
  const acted = (label: string) => { setVersion(v => v + 1); notify(`${label}: done`, 'success'); };

  const frame = recordFrame(def, creating);
  const recordOpen = Boolean(view && (creating || openKey));
  const listHidden = recordOpen && hidesList(frame);
  return (
    <section className="panel ds-app">
      <div className="kit-app-list" hidden={listHidden}>
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>{def.title}</h2>
          {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        </div>
        <div className="ds-actions">
          {def.canCreate !== false && <button className="button small" disabled={!view} onClick={create}><Plus size={15} />New {def.noun[0]}</button>}
        </div>
      </div>
      {view?.mode === 'local' && onSampleData(def.id) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {viewError && <Notice error><AlertCircle size={16} />{viewError}</Notice>}
      <DrillFromBar from={params.get('from')} />
      {ready && drill.dropped.length > 0 && <Notice kind="warn">{DRILL_DROPPED}</Notice>}
      {!ready && <Loading text={`Loading ${def.noun[1].toLowerCase()}…`} />}
      {ready && <LargeList key={drillKey} moduleId={def.id} list={def.list} lk={lk} version={version} noun={def.noun[1].toLowerCase()} onOpen={open} initialValues={initialValues} />}
      <p className="panel-note">Click a row to open it. Every change is checked before it is saved{view?.mode === 'odata' ? ' to SAP' : ''}.</p>
      </div>
      {recordOpen && <ObjectEditor key={creating ? 'new' : openValue ?? ''} def={def} lk={lk} objectKey={creating ? null : openKey} frame={frame}
        onClose={close} onSaved={saved} onDeleted={deleted} onAction={acted} handle={editor} />}
      <Toast toast={toast} />
    </section>
  );
}
