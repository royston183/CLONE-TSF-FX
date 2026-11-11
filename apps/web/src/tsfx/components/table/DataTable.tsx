import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type Ref, type TableHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter } from 'lucide-react';
import { ColumnFilter } from '@tsfx/components/workbench/ColumnFilter';
import { fitTableColumns, type MeasuredColumn, type TableColumn, type TableKind } from '@tsfx/lib/grid/table-layout';
import { elements, hasHandler, headerCells, nodeText, renderTableParts, type CellElement, type TableSort } from './table-model';
import { LayoutControls } from '@tsfx/components/report/LayoutControls';
import { useTableLayout } from './use-table-layout';
import { exportTableExcel } from './export-table';

export type { TableColumn } from '@tsfx/lib/grid/table-layout';
export { columnsFor } from '@tsfx/lib/grid/table-layout';

/** Shared native table: one column plan governs headers, values, totals, sorting and editable cells. */
export function DataTable({ columns, children, className = '', nativeLayout = false, nativeExport = false, ref: forwardedRef, ...props }: TableHTMLAttributes<HTMLTableElement> & { columns?: TableColumn[]; nativeLayout?: boolean; nativeExport?: boolean; ref?: Ref<HTMLTableElement> }) {
  const ref = useRef<HTMLTableElement>(null);
  const cols = useRef<HTMLTableColElement>(null);
  const heads = headerCells(children);
  const labels = heads.map((head, index) => (nodeText(head.props.children) || String(head.props.label ?? '')).replace(/[▲▼↑↓]/g, '').trim() || (columns?.[index]?.kind === 'flag' || index === 0 ? 'Selection' : `Column ${index + 1}`));
  const storageKey = `app-table-layout:v2:${typeof location === 'undefined' ? '/' : location.pathname}:${props.id ?? props['aria-label'] ?? labels.join('|')}`;
  const [sort, setSort] = useState<TableSort | null>(null);
  // Excel-style column filters: per column the values kept, and each row's value read when the filter was set.
  const [filters, setFilters] = useState<{ column: number; allowed: string[]; values: Record<string, string> }[]>([]);
  const [filterAt, setFilterAt] = useState<{ column: number; anchor: HTMLElement; values: string[] } | null>(null);
  const closeFilter = () => setFilterAt(null);
  const captureValues = (column: number) => {
    const values: Record<string, string> = {};
    for (const row of ref.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-table-row]') ?? []) {
      const cell = row.querySelector<HTMLTableCellElement>(`[data-table-column="${column}"]`);
      const control = cell?.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]):not([type=radio]),select,textarea');
      const flag = cell?.querySelector<HTMLInputElement>('input[type=checkbox],input[type=radio]');
      values[row.dataset.tableRow!] = control instanceof HTMLSelectElement ? control.selectedOptions[0]?.text ?? '' : control?.value ?? (flag ? flag.checked ? 'Yes' : 'No' : cell?.textContent ?? '');
    }
    return values;
  };
  const selectable = (index: number) => !/^(actions?|select(ion)?|remove|delete)$/i.test(labels[index]) && columns?.[index]?.kind !== 'actions' && !elements(heads[index].props.children).some(node => node.type === 'input');
  const { alv, target: layoutTarget } = useTableLayout(storageKey, labels, heads.map((_, i) => i).filter(selectable), next => {
    const first = next.sort[0];
    setSort(first ? { column: Number(first.col), descending: first.desc, values: captureValues(Number(first.col)) } : null);
  });
  const order = nativeLayout ? heads.map((_, index) => index) : alv.layout.columns.map(Number);
  const clearSort = () => {
    if (!nativeLayout && alv.layout.sort.length) alv.change({ ...alv.layout, sort: [] });
    setSort(null);
  };
  const layoutSort = !nativeLayout ? alv.layout.sort[0] : undefined;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (sort || layoutSort) setSort(current => {
        if (!current && layoutSort) return { column: Number(layoutSort.col), descending: layoutSort.desc, values: captureValues(Number(layoutSort.col)) };
        if (!current) return current;
        const values = captureValues(current.column);
        return JSON.stringify(values) === JSON.stringify(current.values) ? current : { ...current, values };
      });
      if (filters.length) setFilters(current => {
        const next = current.map(f => ({ ...f, values: captureValues(f.column) }));
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [children, sort, layoutSort, filters.length]);
  const renderHeader = (head: CellElement, index: number) => {
    if (head.type === 'td') return head;
    if (hasHandler(head)) {
      // Preserve upstream sort/paging; a locally sorted column must release it on a native sort.
      if (head.type === 'th' && typeof head.props.onClick === 'function') {
        const click = head.props.onClick as React.MouseEventHandler<HTMLButtonElement>;
        return cloneElement(head, { onClick: undefined, onClickCapture: clearSort },
          <button type="button" className="sort-th kit-table-sort" onClick={click}>{head.props.children}<ArrowUpDown size={12} /></button>);
      }
      return cloneElement(head, { onClickCapture: clearSort });
    }
    const text = nodeText(head.props.children);
    const selection = !text || /^(actions?|select(ion)?|remove|delete)$/i.test(text) || columns?.[index]?.kind === 'actions' || elements(head.props.children).some(node => node.type === 'input');
    if (selection) return head;
    const active = sort?.column === index;
    const interactive = elements(head.props.children).some(node => node.type === 'button' || node.type === 'a');
    const control = <button type="button" className="sort-th kit-table-sort kit-table-local-sort" aria-label={interactive ? `Sort ${text}` : undefined} title={`Sort ${text}`} onClick={event => {
        event.stopPropagation();
        const values = captureValues(index);
        const descending = sort?.column === index ? !sort.descending : false;
        if (!nativeLayout) alv.change({ ...alv.layout, sort: [{ col: String(index), desc: descending }] });
        setSort({ column: index, descending, values });
      }}>{!interactive && head.props.children}{active ? sort.descending ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ArrowUpDown size={12} />}</button>;
    const filtered = filters.some(f => f.column === index);
    const funnel = <button type="button" className={`kit-table-filter${filtered ? ' on' : ''}`} aria-label={`Filter ${text}`} aria-pressed={filtered} title={`Filter ${text}`}
      onClick={event => {
      event.stopPropagation();
      const anchor = event.currentTarget;
      const values = [...new Set(Object.values(captureValues(index)).map(v => v.trim()))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      setFilterAt(f => (f?.column === index ? null : { column: index, anchor, values }));
    }}><Filter size={11} /></button>;
    return cloneElement(head, { 'aria-sort': active ? sort.descending ? 'descending' : 'ascending' : 'none' }, <span className="kit-table-heading">{interactive ? <>{head.props.children}{control}</> : control}{funnel}</span>);
  };
  const hidden = filters.length ? (rowId: string) => filters.some(f => f.values[rowId] !== undefined && !f.allowed.includes(f.values[rowId].trim())) : undefined;
  const parts = renderTableParts(children, order, sort, renderHeader, hidden);
  const applyFilter = (column: number, selected: string[]) => {
    setFilters(current => [...current.filter(f => f.column !== column), ...(selected.length ? [{ column, allowed: selected, values: captureValues(column) }] : [])]);
    setFilterAt(null);
  };
  useLayoutEffect(() => {
    const table = ref.current, group = cols.current;
    if (!table || !group) return;
    let live = true;
    let frame = 0, observedWidth = -1;
    const fit = () => {
      if (!live) return;
      const rows = [...table.rows];
      // Imported screens carry high-specificity legacy width/wrapping rules. The
      // shared column plan owns these properties, just as it owns the colgroup.
      table.style.setProperty('table-layout', 'fixed', 'important');
      table.style.setProperty('width', 'var(--kit-table-width, max-content)', 'important');
      if (table.parentElement) table.parentElement.style.overflowX = 'auto';
      for (const row of rows) for (const cell of row.cells) {
        cell.style.setProperty('white-space', 'nowrap', 'important');
        cell.style.setProperty('overflow-wrap', 'normal', 'important');
        cell.style.setProperty('word-break', 'normal', 'important');
        cell.style.setProperty('max-width', 'none', 'important');
        cell.style.setProperty('left', 'auto', 'important');
        cell.style.setProperty('right', 'auto', 'important');
        if (cell.tagName === 'TD') for (const child of cell.querySelectorAll<HTMLElement>('div,p,small,span,br')) {
          if (child.tagName === 'BR') child.style.display = 'none';
          else {
            child.style.setProperty('white-space', 'nowrap', 'important');
            child.style.setProperty('display', 'inline-flex', 'important');
            child.style.setProperty('flex-direction', 'row', 'important');
            child.style.setProperty('flex-wrap', 'nowrap', 'important');
            if (child.textContent?.trim() && !child.querySelector('input,select,textarea,button')) {
              child.style.setProperty('max-width', 'none', 'important');
              child.style.setProperty('width', 'auto', 'important');
              child.style.setProperty('overflow', 'visible', 'important');
            }
          }
        }
      }
      const count = Math.max(0, ...rows.map(r => [...r.cells].reduce((n, c) => n + c.colSpan, 0)));
      if (!count) return;
      const buckets: HTMLTableCellElement[][] = Array.from({ length: count }, () => []);
      for (const row of rows) {
        let i = 0;
        for (const cell of row.cells) { if (cell.colSpan === 1) buckets[i]?.push(cell); i += cell.colSpan; }
      }
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const textWidth = (text: string, cell: Element) => {
        if (!context) return text.length * 7;
        const style = getComputedStyle(cell);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(text).width;
      };
      const measured: MeasuredColumn[] = buckets.map((cells, i) => {
        const head = cells.find(c => c.tagName === 'TH');
        const body = cells.filter(c => c.closest('tbody'));
        const control = body.find(c => c.querySelector('input:not([type=checkbox]):not([type=radio]),select'))?.querySelector<HTMLInputElement>('input:not([type=checkbox]):not([type=radio]),select');
        const spec = columns?.[order[i]];
        const numeric = cells.some(c => c.matches('.md-amt,.kit-num,.num,.right,.numcell,.numeric')) || control?.inputMode === 'decimal' || control?.inputMode === 'numeric';
        const kind: TableKind = spec?.kind ?? (cells.some(c => c.matches('.ds-cb,.ds-flag') || c.querySelector('input[type=checkbox]')) ? 'flag'
          : cells.some(c => c.matches('.ds-rm-col')) ? 'actions'
          : control?.type === 'date' || body.some(c => /^\d{2}[-/.]\d{2}[-/.]\d{4}$/.test(c.textContent?.trim() ?? '')) ? 'date'
          : cells.some(c => c.querySelector('.kit-status')) ? 'status'
          : cells.some(c => c.querySelector('.kit-amount')) ? 'amount'
          : numeric ? 'number'
          : cells.some(c => c.matches('.ds-code,.md-id') || c.querySelector('input.mono')) ? 'code' : 'text');
        const header = head?.textContent?.trim() ?? '';
        const headerWidth = (head ? textWidth(header, head) : 0) + 24 + (head?.querySelectorAll('button svg').length ?? 0) * 17;
        const contentWidth = Math.max(headerWidth, ...body.map(cell => {
          const input = cell.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]),select');
          const text = input instanceof HTMLSelectElement ? input.selectedOptions[0]?.text ?? '' : input?.value ?? cell.textContent?.trim().replace(/\s+/g, ' ') ?? '';
          const controlWidth = input ? (kind === 'date' ? 166 : kind === 'amount' ? 192 : 120) : 0;
          const badge = cell.querySelector<HTMLElement>('.kit-status');
          const display = input ?? badge ?? cell.querySelector('a,button,strong,b') ?? cell;
          let extra = 0;
          if (badge) {
            const style = getComputedStyle(badge);
            const icons = [...badge.querySelectorAll<HTMLElement>('.kit-status-dot,svg')];
            extra = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
              + icons.reduce((sum, icon) => sum + icon.getBoundingClientRect().width + (parseFloat(style.columnGap) || 0), 0);
          }
          const buttons = [...cell.querySelectorAll<HTMLElement>('button')].reduce((sum, element) => sum + element.getBoundingClientRect().width, 0);
          return Math.max(controlWidth, buttons + (buttons ? 28 : 0), textWidth(text, display) + 34 + extra);
        }));
        const composite = body.some(c => c.querySelectorAll('.kit-range input[type=date]').length === 2) ? 326
          : body.some(c => c.querySelector('.kit-range select')) ? 238 : 0;
        const minWidth = spec?.minWidth ?? (control ? Math.max(composite, kind === 'date' ? 166 : kind === 'amount' ? 192 : 120) : undefined);
        return { kind, contentWidth, headerWidth, minWidth, align: spec?.align, width: spec?.width };
      });
      const plan = fitTableColumns(measured, table.parentElement?.clientWidth ?? 0);
      const elements = plan.map((c, i) => {
        const col = document.createElement('col'); col.style.width = `${c.width}px`;
        const valueCell = buckets[i].find(cell => cell.closest('tbody'));
        for (const cell of buckets[i]) {
          cell.dataset.tableAlign = c.align; cell.dataset.tableKind = c.kind;
          if (cell.tagName === 'TH' && c.align === 'right') {
            if (valueCell) cell.style.setProperty('padding-right', getComputedStyle(valueCell).paddingRight, 'important');
            for (const button of cell.querySelectorAll<HTMLElement>('.sort-th,.ds-sort')) {
              button.style.setProperty('position', 'relative');
              button.style.setProperty('flex-direction', 'row', 'important');
              button.style.setProperty('justify-content', 'flex-end', 'important');
              button.style.setProperty('padding', '0', 'important');
              for (const icon of button.querySelectorAll<SVGElement>('svg')) {
                icon.style.position = 'absolute'; icon.style.right = '-10px'; icon.style.top = '50%'; icon.style.transform = 'translateY(-50%)';
              }
            }
          }
        }
        return col;
      });
      // This otherwise empty colgroup is owned by the sizing effect, so React never reconciles its children.
      group.replaceChildren(...elements);
      table.style.setProperty('--kit-table-width', `${plan.reduce((sum, c) => sum + c.width, 0)}px`);
    };
    fit();
    // Row wrapping changes height. Only a container width change needs another fit, outside the observer delivery.
    const resize = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (!live || Math.abs(width - observedWidth) < 0.5) return;
      observedWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    if (table.parentElement) resize.observe(table.parentElement);
    void document.fonts.ready.then(() => { if (live) { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); } });
    return () => { live = false; cancelAnimationFrame(frame); resize.disconnect(); };
  }, [children, columns, sort, nativeLayout, order]);
  return <>
    {heads.length > 0 && (!nativeLayout || !nativeExport) && <div className="kit-table-tools" role="group" aria-label={`${props['aria-label'] ?? 'Table'} table tools`}>
      {!nativeLayout && <LayoutControls alv={alv} target={layoutTarget} units={null} canShare={false} browserLocal />}
      {!nativeExport && <button type="button" className="button secondary small" aria-label="Export table to Excel" onClick={() => { if (ref.current) exportTableExcel(ref.current); }}><Download size={14} />Export Excel</button>}
    </div>}
    <table {...props} onClickCapture={event => {
      props.onClickCapture?.(event);
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('th') && target.closest('.sort-th,.sort-button,.ds-sort,th.sortable') && !target.closest('.kit-table-local-sort')) clearSort();
    }} ref={element => { ref.current = element; if (typeof forwardedRef === 'function') forwardedRef(element); else if (forwardedRef) forwardedRef.current = element; }} className={`${className} kit-data-table`.trim()}>
      <colgroup ref={cols} />{parts}
    </table>
    {filterAt && <ColumnFilter key={filterAt.column} anchor={filterAt.anchor} values={filterAt.values} active={filters.find(f => f.column === filterAt.column)?.allowed ?? []}
      onApply={selected => applyFilter(filterAt.column, selected)} onClose={closeFilter} />}
  </>;
}
