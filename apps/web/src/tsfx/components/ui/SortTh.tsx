import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode, ThHTMLAttributes } from 'react';
import { ariaSort } from '@tsfx/lib/grid/sort';
import type { SortState } from '@tsfx/lib/grid/types';

export function SortIcon({ sort, col }: { sort: SortState; col: string }) {
  if (sort.col !== col) return <ArrowUpDown size={12} className="sort-idle" />;
  return sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

/** A header cell whose label sorts the table. */
export function SortTh({ col, sort, onSort, children, className = '', ...props }: { col: string; sort: SortState; onSort: (col: string) => void; children: ReactNode } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...props} className={`sortable ${sort.col === col ? 'sorted' : ''} ${className}`} aria-sort={ariaSort(sort, col)}>
      <button type="button" className="sort-th" onClick={() => onSort(col)}>{children}<SortIcon sort={sort} col={col} /></button>
    </th>
  );
}
