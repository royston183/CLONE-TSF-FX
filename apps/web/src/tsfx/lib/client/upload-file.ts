// A picked file → field rows: type and size are checked before reading, the row limit before matching.
import type { AnyField } from '@tsfx/lib/fields';
import { matchColumns, type MatchedRows } from '@tsfx/lib/upload/columns';
import { parseCsv } from './csv';
import { readXlsx, type SheetRow } from './xlsx';

export async function readUpload(file: File, defs: AnyField[], { maxBytes, maxRows }: { maxBytes: number; maxRows: number }): Promise<MatchedRows> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Save the file as .xlsx (Excel Workbook) or .csv.');
  if (!/\.(xlsx|csv|txt)$/.test(name)) throw new Error('Choose an .xlsx or .csv file.');
  if (file.size > maxBytes) throw new Error(`The file is larger than ${(maxBytes / 1048576).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB.`);
  const table: SheetRow[] = name.endsWith('.xlsx')
    ? await readXlsx(await file.arrayBuffer())
    : parseCsv(await file.text()).map((cells, i) => ({ line: i + 1, cells }));
  const dataRows = table.filter(r => r.cells.some(c => c.trim())).length - 1;
  if (dataRows > maxRows) throw new Error(`The file has ${dataRows} rows; upload at most ${maxRows} at a time.`);
  const matched = matchColumns(defs, table);
  if (!matched.rows.length) throw new Error('The file has no rows below the heading row.');
  return matched;
}
