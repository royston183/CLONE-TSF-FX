import { useMemo, useState } from 'react';
import type { ActiveLayout, AlvLayout } from '@tsfx/lib/layout/alv-types';
import { normalizeLayout, type LayoutTarget } from '@tsfx/lib/layout/layout';
import type { LayoutState, SavedLayout } from '@tsfx/lib/report/types';

/** Browser tables use the same picker and dialogs as Master Contract's server layouts. */
export function useTableLayout(storageKey: string, labels: string[], sortable: number[], onApply: (layout: LayoutState) => void) {
  const signature = JSON.stringify([labels, sortable]);
  const target = useMemo<LayoutTarget>(() => {
    const [names, sorts] = JSON.parse(signature) as [string[], number[]];
    const columns = names.map((_, i) => String(i));
    return { columns, labels: Object.fromEntries(names.map((label, i) => [String(i), label])),
      sortColumns: sorts.map(String), subtotalColumns: [], maxSort: 1, maxSubtotals: 0,
      units: [], pageSizes: null,
      standard: { columns, sort: [], subtotals: [], subtotalsOnly: false, unit: null } };
  }, [signature]);
  const [state, setState] = useState(() => {
    let layouts: SavedLayout[] = [];
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(saved)) layouts = saved.filter((item): item is SavedLayout => Boolean(item && typeof item.name === 'string' && item.layout && item.scope === 'personal'));
    } catch { /* Use Standard when storage is unavailable. */ }
    const initial = layouts.find(l => l.isDefault);
    return { layouts, draft: initial?.layout ?? target.standard, active: initial ? { name: initial.name, scope: initial.scope } as ActiveLayout : null, modified: false };
  });
  const persist = (layouts: SavedLayout[]) => {
    // Let Save Layout show a storage error instead of claiming a layout was saved.
    localStorage.setItem(storageKey, JSON.stringify(layouts));
  };
  const apply = (draft: LayoutState, active: ActiveLayout | null, modified: boolean) => {
    const next = normalizeLayout(draft, target);
    setState(current => ({ ...current, draft: next, active, modified }));
    onApply(next);
  };
  const alv: AlvLayout = {
    layout: normalizeLayout(state.draft, target), active: state.active, modified: state.modified,
    layouts: state.layouts, ready: true, error: '',
    select: saved => apply(saved?.layout ?? target.standard, saved ? { name: saved.name, scope: saved.scope } : null, false),
    change: next => apply(next, state.active, true),
    async save(meta, draft) {
      const layout = normalizeLayout(draft, target);
      const saved: SavedLayout = { ...meta, scope: 'personal', layout, changedBy: 'Current browser', changedOn: new Date().toISOString() };
      const layouts = [...state.layouts.filter(l => l.name.toLowerCase() !== meta.name.toLowerCase()).map(l => meta.isDefault ? { ...l, isDefault: false } : l), saved];
      persist(layouts);
      setState({ layouts, draft: layout, active: { name: saved.name, scope: saved.scope }, modified: false });
      onApply(layout);
    },
    async remove() {
      const layouts = state.layouts.filter(l => l.name !== state.active?.name);
      persist(layouts);
      setState({ layouts, draft: target.standard, active: null, modified: false });
      onApply(target.standard);
    }
  };
  return { alv, target };
}
