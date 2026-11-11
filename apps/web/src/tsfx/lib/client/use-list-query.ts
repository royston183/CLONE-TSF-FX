// src/lib/client/use-list-query.ts
import { useEffect, useRef, useState } from 'react';
import type { ListPage, ListQuery } from '@tsfx/lib/list/types';
import { moduleQuery } from './data';

/**
 * One page of a large list (module `moduleId`, table `table`) from the data client. A new query cancels the one in flight (AbortController); while it
 * loads, the last page stays on screen (`loading` is true) so the table does not jump. While `hold` is true nothing is read
 * (a list waiting for its default layout reads its first page once, with that layout's sort and page size).
 */
export function useListQuery(moduleId: string, table: string, query: ListQuery, version: number, onPage?: (page: ListPage, query: ListQuery) => void, hold = false) {
  const onPageRef = useRef(onPage);
  useEffect(() => { onPageRef.current = onPage; });
  const [attempt, setAttempt] = useState(0);
  const key = hold ? '' : JSON.stringify([moduleId, table, query, version, attempt]);
  const [result, setResult] = useState<{ key: string; page: ListPage | null; error: string }>({ key: '', page: null, error: '' });
  useEffect(() => {
    if (!key) return;
    const [m, t, q] = JSON.parse(key) as [string, string, ListQuery];
    const controller = new AbortController();
    moduleQuery(m, t, q, controller.signal).then(
      page => {
        if (controller.signal.aborted) return;
        setResult({ key, page, error: '' });
        onPageRef.current?.(page, q);
      },
      (e: Error) => { if (!controller.signal.aborted) setResult(r => ({ key, page: r.page, error: e.message })); }
    );
    return () => controller.abort();
  }, [key]);
  return { page: result.page, error: result.key === key ? result.error : '', loading: hold || result.key !== key, retry: () => setAttempt(a => a + 1) };
}
