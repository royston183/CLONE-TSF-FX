import type { SortState } from './types';

const blank = (v: unknown) => v == null || v === '';

/** Numbers compare numerically, text naturally ("A2" before "A10"), blanks last. */
export function compareValues(a: unknown, b: unknown): number {
  if (blank(a) || blank(b)) return Number(blank(a)) - Number(blank(b));
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Rows sorted by one column; blanks stay last in both directions. */
export function sortRows<T>(rows: T[], valueOf: (row: T, col: string) => unknown, sort: SortState): T[] {
  const col = sort.col;
  if (col == null) return rows;
  return [...rows].sort((x, y) => {
    const a = valueOf(x, col), b = valueOf(y, col);
    return blank(a) || blank(b) ? compareValues(a, b) : compareValues(a, b) * sort.dir;
  });
}

export const nextSort = (sort: SortState, col: string): SortState =>
  sort.col === col ? { col, dir: sort.dir === 1 ? -1 : 1 } : { col, dir: 1 };

export const ariaSort = (sort: SortState, col: string): 'none' | 'ascending' | 'descending' =>
  sort.col !== col ? 'none' : sort.dir === 1 ? 'ascending' : 'descending';
