// src/lib/client/use-layouts.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultLayout, normalizeLayout, type LayoutTarget } from '@tsfx/lib/layout/layout';
import type { LayoutState, SavedLayout } from '@tsfx/lib/report/types';
import type { ActiveLayout, AlvLayout } from '@tsfx/lib/layout/alv-types';
export type { ActiveLayout, AlvLayout } from '@tsfx/lib/layout/alv-types';
import type { HttpError } from '@tsfx/lib/errors';
import { layoutsList, layoutsRemove, layoutsSave } from './data';

/**
 * An ALV layout and the module's saved layouts (spec §4): on open the default applies (personal, else shared, else the
 * Standard layout). `onApply` runs whenever a layout is applied. `target` must keep its identity (useMemo).
 */
export function useAlvLayout(moduleId: string, target: LayoutTarget, enabled: boolean, onApply?: (layout: LayoutState) => void): AlvLayout {
  const applied = useRef(onApply);
  useEffect(() => { applied.current = onApply; });
  const [state, setState] = useState<{ active: ActiveLayout | null; draft: LayoutState; modified: boolean }>(() => ({ active: null, draft: target.standard, modified: false }));
  const [store, setStore] = useState<{ layouts: SavedLayout[]; error: string; loaded: boolean }>({ layouts: [], error: '', loaded: false });
  const layout = useMemo(() => normalizeLayout(state.draft, target), [state.draft, target]);
  const apply = useCallback((draft: LayoutState, active: ActiveLayout | null, modified: boolean) => {
    const next = normalizeLayout(draft, target);
    setState({ active, draft: next, modified });
    applied.current?.(next);
  }, [target]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    layoutsList(moduleId).then(r => {
      if (!live) return;
      setStore({ layouts: r.layouts, error: '', loaded: true });
      const d = defaultLayout(r.layouts);
      if (d) apply(d.layout, { name: d.name, scope: d.scope }, false);
    }, (e: Error) => { if (live) setStore(s => ({ ...s, error: `Saved layouts are unavailable: ${e.message}`, loaded: true })); });
    return () => { live = false; };
  }, [moduleId, enabled, apply]);

  // Picking or changing a layout clears an earlier layout error (it belonged to the last action).
  const clearError = () => setStore(s => (s.error ? { ...s, error: '' } : s));
  return {
    layout, active: state.active, modified: state.modified, layouts: store.layouts, error: store.error, ready: !enabled || store.loaded,
    select: saved => { clearError(); apply(saved ? saved.layout : target.standard, saved ? { name: saved.name, scope: saved.scope } : null, false); },
    change: next => { clearError(); apply(next, state.active, true); },
    async save(meta, next) {
      const r = await layoutsSave(moduleId, { ...meta, layout: next });
      setStore({ layouts: r.layouts, error: '', loaded: true });
      const hit = r.layouts.find(l => l.scope === meta.scope && l.name.toLowerCase() === meta.name.toLowerCase());
      apply(next, { name: hit?.name ?? meta.name, scope: meta.scope }, false);
    },
    async remove() {
      if (!state.active) return;
      try {
        const r = await layoutsRemove(moduleId, state.active.name, state.active.scope);
        setStore({ layouts: r.layouts, error: '', loaded: true });
        apply(target.standard, null, false);
      } catch (e) {
        const error = e as HttpError;
        // Gone already (someone else deleted it): show what is saved now and fall back to the Standard layout.
        if (error.status === 404) {
          const r = await layoutsList(moduleId).catch(() => null);
          setStore(s => ({ layouts: r?.layouts ?? s.layouts.filter(l => !(l.scope === state.active?.scope && l.name === state.active?.name)), error: error.message, loaded: true }));
          apply(target.standard, null, false);
          return;
        }
        setStore(s => ({ ...s, error: error.message }));
      }
    }
  };
}
