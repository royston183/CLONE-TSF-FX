import { useState } from 'react';
import { nextSort, sortRows } from '@tsfx/lib/grid/sort';
import type { SortState } from '@tsfx/lib/grid/types';

/** Click-to-sort for any table: numbers numerically, text naturally, blanks last. */
export function useSort<T>(rows: T[], valueOf: (row: T, col: string) => unknown, initial: SortState = { col: null, dir: 1 }) {
  const [sort, setSort] = useState<SortState>(initial);
  return { rows: sortRows(rows, valueOf, sort), sort, toggle: (col: string) => setSort(s => nextSort(s, col)) };
}
