// .xlsx reader for the browser, ported from ALM src/pages/tb-data/upload.js: the zip is opened with the browser's own
// DecompressionStream (no spreadsheet library) and the FIRST worksheet in workbook order is read. Shared strings,
// inline strings, numbers and booleans become text; Excel date serials stay numbers (the date field type reads them).
export interface SheetRow { line: number; cells: string[] }

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : XML_ENTITIES[e] ?? m));
const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1])).join('');
const columnIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const MAX_ENTRY_BYTES = 50 * 1048576, MAX_TOTAL_BYTES = 100 * 1048576;
const TOO_LARGE = 'The .xlsx file is too large once unpacked.';
const DAMAGED = 'The .xlsx file is damaged.';

/** Inflates raw deflate data, stopping as soon as the output passes the size the zip directory declared. */
async function inflate(data: Uint8Array, declared: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > declared) { await reader.cancel(); throw new Error(TOO_LARGE); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** The entries of a zip archive (an .xlsx is one); deflated entries go through DecompressionStream, with size caps. */
export async function unzip(buffer: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('This is not an .xlsx file (no zip directory).');
  try {
    const count = view.getUint16(end + 10, true);
    const entries: { name: string; method: number; size: number; full: number; start: number }[] = [];
    const decoder = new TextDecoder();
    let at = view.getUint32(end + 16, true), total = 0;
    for (let n = 0; n < count; n++) {
      if (view.getUint32(at, true) !== 0x02014b50) throw new Error(DAMAGED);
      const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), full = view.getUint32(at + 24, true), nameLength = view.getUint16(at + 28, true);
      const extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      if (full > MAX_ENTRY_BYTES || (total += full) > MAX_TOTAL_BYTES) throw new Error(TOO_LARGE);
      entries.push({ name, method, size, full, start: local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true) });
      at += 46 + nameLength + extra + comment;
    }
    const files: Record<string, Uint8Array> = {};
    for (const { name, method, size, full, start } of entries) {
      const data = bytes.subarray(start, start + size);
      if (method === 0) files[name] = data;
      else if (method === 8) files[name] = await inflate(data, full);
      else throw new Error('The .xlsx file uses a compression this browser reader does not support. Save it again in Excel.');
    }
    return files;
  } catch (e) {
    if (e instanceof Error && !(e instanceof RangeError) && (e.message === TOO_LARGE || e.message === DAMAGED || e.message.startsWith('The .xlsx file uses'))) throw e;
    throw new Error(DAMAGED);
  }
}

/** The first worksheet (workbook order, not file name) as rows of cell texts, each with its sheet line. */
export async function readXlsx(buffer: ArrayBuffer): Promise<SheetRow[]> {
  const files = await unzip(buffer);
  const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : '');
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(text('xl/workbook.xml'))?.[1];
  const rel = firstId ? [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(tag => tag.includes(`Id="${firstId}"`)) : undefined;
  const target = rel ? /\bTarget="([^"]+)"/.exec(rel)?.[1] : undefined;
  const sheetName = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheet = text(sheetName);
  if (!sheet) throw new Error('The workbook has no worksheet.');
  // Phonetic runs (<rPh>) are reading aids, not part of the text.
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si\b(?:\/>|[^>]*>([\s\S]*?)<\/si>)/g)].map(m => textOf((m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  const rows: SheetRow[] = [];
  for (const [, attrs, body = ''] of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const [, cellAttrs, inner = ''] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cellAttrs)?.[1], type = /\bt="(\w+)"/.exec(cellAttrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(inner) : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : type === 'e' ? '' : unescapeXml(v ?? '');
      cells[ref ? columnIndex(ref) : cells.length] = value;
    }
    rows.push({ line: Number(/\br="(\d+)"/.exec(attrs)?.[1]) || rows.length + 1, cells: Array.from(cells, c => c ?? '') });
  }
  return rows;
}
