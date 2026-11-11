import { DataTable, columnsFor } from '@tsfx/components/table/DataTable';
import { StatusValue } from '@tsfx/components/ui/StatusValue';
// src/components/list/LargeList.tsx
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Database, RefreshCw, Search } from 'lucide-react';
import { alignClass, alignOf } from '@tsfx/lib/fields';
import { keyOf } from '@tsfx/lib/grid/grid';
import { nextSort } from '@tsfx/lib/grid/sort';
import type { Column, Row } from '@tsfx/lib/grid/types';
import { useAlvLayout } from '@tsfx/lib/client/use-layouts';
import { useListQuery } from '@tsfx/lib/client/use-list-query';
import { listLayoutTarget } from '@tsfx/lib/layout/layout';
import { clampPage, filtersOf, lastPage, rangeText } from '@tsfx/lib/list/pagination';
import { pageSizesOf, sortColumnsOf, type AnyList, type ListQuery, type ListSort } from '@tsfx/lib/list/types';
import type { LayoutState } from '@tsfx/lib/report/types';
import { LayoutControls } from '@tsfx/components/report/LayoutControls';
import { useWorkspace } from '@tsfx/components/shell/WorkspaceProvider';
import { Notice } from '@tsfx/components/ui/Notice';
import { SortTh } from '@tsfx/components/ui/SortTh';
import { ListFilters } from './ListFilters';

interface Draft { search: string; values: Record<string, string[]> }
interface Applied extends Draft { sort: ListSort; page: number; pageSize: number }

export interface LargeListProps {
  moduleId: string;
  list: AnyList;
  lk: unknown;
  /** Plural, lower case: "deals". */
  noun: string;
  /** Bump to read the current page again (after a save). */
  version?: number;
  onOpen?: (row: Row) => void;
  onRowDoubleClick?: (row: Row) => void;
  /** Tick boxes (table maintenance): the ticked rows, across pages. */
  selection?: { rows: Row[]; onChange: (rows: Row[]) => void };
  /** Filter-bar values the list starts with (a drill's f.* filters, already checked). */
  initialValues?: Record<string, string[]>;
}

/**
 * A table SAP searches, filters, sorts and pages (ALM .ds-filters, .ds-table and .pagination). With `list.layouts`, ALV
 * layouts (spec §4.1) choose its columns, its server sort and its page size, saved shared or personal.
 */
export function LargeList({ moduleId, list, lk, noun, version = 0, onOpen, onRowDoubleClick, selection, initialValues }: LargeListProps) {
  const { workspace } = useWorkspace();
  const sizes = pageSizesOf(list);
  const target = useMemo(() => listLayoutTarget(list), [list]);
  const [draft, setDraft] = useState<Draft>(() => ({ search: '', values: initialValues ?? {} }));
  const [applied, setApplied] = useState<Applied>(() => ({ search: '', values: initialValues ?? {}, sort: list.defaultSort, page: 1, pageSize: sizes[0] }));
  const sortOf = (layout: LayoutState): ListSort => (layout.sort[0] ? { field: layout.sort[0].col, dir: layout.sort[0].desc ? -1 : 1 } : list.defaultSort);
  // Applying a layout reads page 1 again with its sort and page size.
  const alv = useAlvLayout(moduleId, target, Boolean(list.layouts), layout => setApplied(a => ({ ...a, sort: sortOf(layout), pageSize: layout.pageSize ?? a.pageSize, page: 1 })));
  const me = workspace.session?.actingUser ?? '';
  const editors = list.layouts?.sharedEditors;
  const canShare = !editors || editors.some(e => e.toUpperCase() === me);
  // Typing waits 300 ms; then page 1 of the new search is read and the previous request is cancelled.
  useEffect(() => {
    // Expanding an amount on blur changes its spelling, not the filter. Keep the
    // current page when that formatting finishes after a sort or Next click.
    const timer = setTimeout(() => setApplied(a => (a.search === draft.search && JSON.stringify(filtersOf(list, a.values)) === JSON.stringify(filtersOf(list, draft.values)) ? a : { ...a, search: draft.search, values: draft.values, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [draft, list]);
  const query = useMemo<ListQuery>(() => ({
    ...(applied.search.trim() ? { search: applied.search.trim() } : {}),
    filters: filtersOf(list, applied.values), sort: applied.sort, page: applied.page, pageSize: applied.pageSize
  }), [applied, list]);
  // With layouts, the first page waits for the saved layouts: a default layout's sort and page size apply before SAP is read.
  const { page, error, loading, retry } = useListQuery(moduleId, list.entity, query, version, (loaded, asked) => {
    // The total shrank (a save, a delete, another user): step back to the last page instead of showing an empty one.
    const to = clampPage(asked.page, loaded.total, asked.pageSize);
    if (to !== asked.page) setApplied(a => (a.page === asked.page ? { ...a, page: to } : a));
  }, !alv.ready);

  const rows = page?.rows ?? [];
  const total = page?.total ?? 0;
  const last = lastPage(applied.pageSize, total);
  const columns: Column[] = list.layouts ? alv.layout.columns.map(id => list.columns.find(c => c.field === id)).filter((c): c is Column => Boolean(c)) : list.columns;
  const sortable = new Set(sortColumnsOf(list));
  const sortState = { col: applied.sort.field, dir: applied.sort.dir };
  const side = (c: Column) => alignClass(alignOf(c.field, list.fields, c.align));
  const onSort = (col: string) => {
    const s = nextSort(sortState, col);
    // With layouts a header click changes the layout (the picker shows *); applying it reads page 1.
    if (list.layouts) alv.change({ ...alv.layout, sort: [{ col, desc: s.dir === -1 }] });
    else setApplied(a => ({ ...a, sort: { field: col, dir: s.dir }, page: 1 }));
  };
  const onPageSize = (n: number) => {
    if (list.layouts) alv.change({ ...alv.layout, pageSize: n });
    else setApplied(a => ({ ...a, pageSize: n, page: 1 }));
  };
  const go = (n: number) => setApplied(a => ({ ...a, page: Math.min(Math.max(1, n), last) }));
  const picked = new Set((selection?.rows ?? []).map(r => keyOf(list, r)));
  const toggle = (r: Row) => {
    if (!selection) return;
    const k = keyOf(list, r);
    selection.onChange(picked.has(k) ? selection.rows.filter(x => keyOf(list, x) !== k) : [...selection.rows, r]);
  };
  const allOn = rows.length > 0 && rows.every(r => picked.has(keyOf(list, r)));
  const toggleAll = (on: boolean) => {
    if (!selection) return;
    const here = new Set(rows.map(r => keyOf(list, r)));
    selection.onChange(on ? [...selection.rows, ...rows.filter(r => !picked.has(keyOf(list, r)))] : selection.rows.filter(r => !here.has(keyOf(list, r))));
  };
  const filtering = Boolean(query.search) || Boolean(query.filters?.length);

  return (
    <div className="kit-list">
      {error && <Notice error action={{ label: 'Retry', onClick: retry }}><AlertCircle size={16} />{error}</Notice>}
      {alv.error && <Notice error><AlertCircle size={16} />{alv.error}</Notice>}
      <div className="ds-filters">
        <ListFilters list={list} lk={lk} values={draft.values} onChange={values => setDraft(d => ({ ...d, values }))} />
        {list.search?.length ? (
          <label className="search ds-search"><Search size={15} />
            <input aria-label="Search" placeholder="Search…" value={draft.search} onChange={e => setDraft(d => ({ ...d, search: e.target.value }))} />
            {draft.search && <button aria-label="Clear search" onClick={() => setDraft(d => ({ ...d, search: '' }))}>×</button>}
          </label>
        ) : null}
        {list.layouts && <div className="ds-actions"><LayoutControls alv={alv} target={target} units={null} canShare={canShare} /></div>}
      </div>
      <div className={`table-wrap ds-table-wrap kit-list-wrap ${loading && page ? 'kit-loading' : ''}`} aria-busy={loading}>
        <DataTable nativeLayout={Boolean(list.layouts)} columns={[...(selection ? [{ kind: 'flag' as const }] : []), ...columnsFor(columns, list.fields)]} className="ds-table">
          <thead><tr>
            {selection && <th className="ds-cb"><input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={e => toggleAll(e.target.checked)} /></th>}
            {columns.map(c => (sortable.has(c.field)
              ? <SortTh key={c.field} col={c.field} sort={sortState} onSort={onSort} className={side(c)}>{c.label}</SortTh>
              : <th key={c.field} className={side(c) || undefined}>{c.label}</th>))}
          </tr></thead>
          <tbody>{rows.map(r => {
            const k = keyOf(list, r);
            return (
              <tr key={k} className={`${onOpen ? 'kit-row-open' : ''} ${picked.has(k) ? 'checked' : ''}`} tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? () => onOpen(r) : undefined}
                onKeyDown={onOpen ? e => { if (e.key === 'Enter') { e.preventDefault(); onOpen(r); } } : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(r) : undefined}>
                {selection && <td className="ds-cb" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${k}`} checked={picked.has(k)} onChange={() => toggle(r)} /></td>}
                {columns.map(c => <td key={c.field} className={`${c.code ? 'ds-code' : ''} ${c.bold ? 'ds-bold' : ''} ${side(c)}`}><StatusValue definition={c} row={r}>{c.text(r)}</StatusValue></td>)}
              </tr>
            );
          })}</tbody>
        </DataTable>
        {loading && page && <span className="kit-list-spin" role="status" aria-label="Loading"><RefreshCw size={18} className="spin" /></span>}
        {!rows.length && !error && <div className="empty">{loading
          ? `Loading ${noun}…`
          : <><Database size={26} /><h2>{filtering ? `No ${noun} match the current filters` : `No ${noun} yet`}</h2></>}</div>}
      </div>
      <div className="kit-pager"><div className="pagination">
        <span>{page ? rangeText(page.page, page.pageSize, total) : ' '}</span>
        <label className="kit-page-size">Rows
          <select aria-label="Rows per page" value={applied.pageSize} onChange={e => onPageSize(Number(e.target.value))}>{sizes.map(n => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button className="button secondary small" disabled={loading || applied.page <= 1} onClick={() => go(applied.page - 1)}><ChevronLeft size={14} />Previous</button>
        <button className="button secondary small" disabled={loading || applied.page >= last} onClick={() => go(applied.page + 1)}>Next<ChevronRight size={14} /></button>
      </div></div>
    </div>
  );
}
