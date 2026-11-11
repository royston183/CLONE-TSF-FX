import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { parseAmountInput } from '@tsfx/lib/fields/parse';

export type CellElement = ReactElement<{ children?: ReactNode; colSpan?: number; rowSpan?: number; onClick?: unknown; [key: string]: unknown }>;
export function elements(nodes: ReactNode): CellElement[] {
  return Children.toArray(nodes).flatMap(node => !isValidElement(node) ? [] : node.type === Fragment ? elements((node.props as { children?: ReactNode }).children) : [node as CellElement]);
}
export function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return Children.toArray(node).map(child => isValidElement(child) ? nodeText((child.props as { children?: ReactNode }).children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join(' ').replace(/\s+/g, ' ').trim();
}
export function headerCells(nodes: ReactNode): CellElement[] {
  const head = elements(nodes).find(node => node.type === 'thead');
  return head ? elements(elements(head.props.children)[0]?.props.children) : [];
}
export function hasHandler(node: CellElement): boolean {
  return typeof node.props.onSort === 'function' || (typeof node.props.onClick === 'function' && (node.type === 'th' || /sort/.test(String(node.props.className ?? '')))) || elements(node.props.children).some(hasHandler);
}
export interface TableSort { column: number; descending: boolean; values: Record<string, string> }
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export function compareCellValues(a: string, b: string): number {
  const clean = (text: string) => text.trim().replace(/[▲▼↑↓]/g, '').trim();
  a = clean(a); b = clean(b);
  if (!a || a === '—' || a === '–') return !b || b === '—' || b === '–' ? 0 : 1;
  if (!b || b === '—' || b === '–') return -1;
  const number = (text: string) => {
    const raw = text.replace(/^[A-Z]{3}\s+|\s+[A-Z]{3}$/g, '').replace(/%$/, '').trim();
    if (/^0\d+$/.test(raw)) return null;
    const parsed = parseAmountInput(raw, 12);
    return parsed === null || parsed === '' ? null : BigInt(parsed.replace('.', ''));
  };
  const x = number(a), y = number(b);
  if (x !== null && y !== null) return x < y ? -1 : x > y ? 1 : 0;
  const date = (text: string) => {
    const parts = /^(\d{2})[-/.](\d{2})[-/.](\d{4})(.*)$/.exec(text);
    return parts ? `${parts[3]}-${parts[2]}-${parts[1]}${parts[4]}` : text;
  };
  return collator.compare(date(a), date(b));
}

/** React owns the rows and cells throughout sorting/reordering; controls keep their keys and handlers. */
/**
 * `hidden`: data rows a column filter leaves out. They stay in the DOM (hidden), so their values can still be read and a
 * cleared filter shows them again; summary rows (totals, group labels) are never hidden.
 */
export function renderTableParts(nodes: ReactNode, order: number[], sort: TableSort | null, renderHeader: (cell: CellElement, index: number) => CellElement, hidden?: (rowId: string) => boolean): CellElement[] {
  const count = headerCells(nodes).length;
  return elements(nodes).filter(section => section.type !== 'colgroup').map((section, sectionIndex) => {
    if (!['thead', 'tbody', 'tfoot'].includes(String(section.type))) return section;
    const rows = elements(section.props.children);
    const mapped = rows.map((row, rowIndex) => {
      if (row.type !== 'tr') return row;
      const cells = elements(row.props.children);
      const summary = /(^|\s)(qr-heading|qr-total|trm-sub|kit-total|ov-strong)(\s|$)/.test(String(row.props.className ?? ''));
      const regular = !summary && cells.length === count && cells.every(cell => !cell.props.colSpan || cell.props.colSpan === 1);
      const rowId = `${sectionIndex}:${row.key ?? rowIndex}`;
      const transformed = cells.map((cell, index) => cloneElement(section.type === 'thead' ? renderHeader(cell, index) : cell, {
        key: cell.key ?? index, 'data-table-column': index
      }));
      const visible = order.filter(index => transformed[index]).map(index => transformed[index]);
      const spanned: CellElement[] = [];
      if (!regular) {
        const expanded = transformed.flatMap(cell => Array.from({ length: cell.props.colSpan ?? 1 }, () => cell));
        const seen = new Set<CellElement>();
        for (let at = 0; at < order.length;) {
          const cell = expanded[order[at]];
          if (!cell) { at++; continue; }
          let end = at + 1;
          while (end < order.length && expanded[order[end]] === cell) end++;
          spanned.push(cloneElement(cell, { key: `${cell.key}:${at}`, colSpan: end - at === 1 ? undefined : end - at }, seen.has(cell) ? null : cell.props.children));
          seen.add(cell); at = end;
        }
      }
      // Spanning group/total rows stay in place and retain their group semantics.
      const filteredOut = section.type === 'tbody' && regular && hidden ? hidden(rowId) : false;
      return cloneElement(row, { key: row.key ?? rowIndex, 'data-table-row': rowId, 'data-table-regular': regular ? 'true' : undefined, ...(filteredOut ? { hidden: true } : {}) }, regular ? visible : spanned.length ? spanned : transformed);
    });
    if (section.type === 'tbody' && sort) {
      // Sort each contiguous detail group separately; never move totals/group labels into data.
      for (let start = 0; start < mapped.length;) {
        if (mapped[start].props['data-table-regular'] !== 'true') { start++; continue; }
        let end = start;
        while (end < mapped.length && mapped[end].props['data-table-regular'] === 'true') end++;
        const group = mapped.slice(start, end).map((row, index) => ({ row, index }));
        group.sort((a, b) => {
          const av = sort.values[String(a.row.props['data-table-row'])] ?? '', bv = sort.values[String(b.row.props['data-table-row'])] ?? '';
          return compareCellValues(av, bv) * (sort.descending ? -1 : 1) || a.index - b.index;
        });
        mapped.splice(start, end - start, ...group.map(item => item.row));
        start = end;
      }
    }
    return cloneElement(section, { key: section.key ?? sectionIndex }, mapped);
  });
}
