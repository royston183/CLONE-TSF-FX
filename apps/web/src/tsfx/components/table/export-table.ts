import { downloadFile, sheetXlsx, type XlsxCell } from '@tsfx/lib/client/xlsx-write';

const clean = (text: string) => text.replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' ').trim();
function cellValue(cell: HTMLTableCellElement): string {
  const control = cell.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type=checkbox]):not([type=radio]),select,textarea');
  const flag = cell.querySelector<HTMLInputElement>('input[type=checkbox],input[type=radio]');
  return clean(control instanceof HTMLSelectElement ? control.selectedOptions[0]?.text ?? '' : control?.value ?? (flag ? flag.checked ? 'Yes' : 'No' : cell.textContent ?? ''));
}
/** Export the current view: visible columns, displayed sort order and edited input values. */
export function tableExportRows(table: HTMLTableElement): XlsxCell[][] {
  const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
  const included = headers.map((cell, index) => ({ cell, index })).filter(({ cell }) => {
    const label = clean(cell.textContent ?? '');
    return label && !/^(actions?|remove|delete|select(ion)?)$/i.test(label) && !cell.querySelector('input[type=checkbox],input[type=radio]');
  });
  const rows: XlsxCell[][] = [included.map(({ cell }) => cellValue(cell))];
  // Rows a column filter hides are not exported: the file holds what the table shows.
  for (const row of [...table.tBodies].flatMap(body => [...body.rows]).filter(r => !r.hidden).concat([...(table.tFoot?.rows ?? [])])) {
    if (row.cells.length === 1 && row.cells[0].colSpan > 1 && !row.closest('tfoot') && !row.className.includes('trm-sub')) continue;
    const cells = [...row.cells].flatMap(cell => Array.from({ length: cell.colSpan }, (_, offset) => ({ cell, offset })));
    if (cells.length !== headers.length) continue;
    rows.push(included.map(({ index }) => {
      const { cell, offset } = cells[index], text = offset ? '' : cellValue(cell), number = text.replace(/,/g, '');
      return ['amount', 'number'].includes(cell.dataset.tableKind ?? '') && /^-?\d+(\.\d+)?$/.test(number) ? { number } : text;
    }));
  }
  return rows;
}
export function exportTableExcel(table: HTMLTableElement): void {
  const title = table.getAttribute('aria-label') || table.id || 'Table';
  const sheetName = title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Data';
  downloadFile(`${title.replace(/[^a-z\d_-]+/gi, '-').replace(/^-|-$/g, '') || 'Table'}.xlsx`, sheetXlsx(tableExportRows(table), sheetName));
}
