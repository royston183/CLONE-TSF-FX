// One-sheet .xlsx files (ported from ALM src/pages/budget/sheet.js and tb-data/upload.js): text cells, so codes keep their
// leading zeros, and number cells (report exports: amounts Excel can sum). Uncompressed zip entries; no spreadsheet library.
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip archive of stored (uncompressed) text entries. */
export function zip(entries: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const put = (view: DataView, fields: [number, number, 2 | 4][]) => { for (const [at, v, size] of fields) if (size === 4) view.setUint32(at, v, true); else view.setUint16(at, v, true); };
  for (const [name, content] of Object.entries(entries)) {
    const n = enc.encode(name), data = enc.encode(content), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    put(head, [[0, 0x04034b50, 4], [4, 20, 2], [8, 0, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2]]);
    const dir = new DataView(new ArrayBuffer(46));
    put(dir, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [10, 0, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2], [42, offset, 4]]);
    parts.push(new Uint8Array(head.buffer), n, data);
    central.push(new Uint8Array(dir.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0), count = Object.keys(entries).length;
  const end = new DataView(new ArrayBuffer(22));
  put(end, [[0, 0x06054b50, 4], [8, count, 2], [10, count, 2], [12, size, 4], [16, offset, 4]]);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeXml = (s: string) => s.replace(/[&<>"]/g, ch => XML_ESCAPES[ch] ?? ch);
const letter = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** A cell: text (an inline string, never read as a formula), or a number written as a number cell (#,##0.00). */
export type XlsxCell = string | { number: string };
const NUMBER = /^-?\d+(\.\d+)?$/;

function cellXml(v: XlsxCell, ref: string): string {
  if (typeof v !== 'string' && NUMBER.test(v.number)) return `<c r="${ref}" s="1"><v>${v.number}</v></c>`;
  const text = typeof v === 'string' ? v : v.number;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
}

// Two cell formats: 0 General (text), 1 #,##0.00 (numbers).
const STYLES = '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>';

/**
 * A one-sheet workbook: strings are text cells, `{ number }` cells are numbers (anything not a plain number stays text).
 * `widths` (characters, optional) sets the column widths, so long amounts do not show as ####.
 */
export function sheetXlsx(rows: XlsxCell[][], sheetName = 'Data', widths: number[] = []): Uint8Array<ArrayBuffer> {
  const ns = 'http://schemas.openxmlformats.org/', rel = `${ns}officeDocument/2006/relationships`;
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const data = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => cellXml(v, `${letter(c)}${r + 1}`)).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}spreadsheetml/2006/main">${STYLES}</styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`
  });
}

/** Saves bytes as a file in the browser (call from an event handler). */
export function downloadFile(name: string, data: Uint8Array<ArrayBuffer>, type = XLSX_TYPE): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Edge may hand the Blob to its download process after a busy frame or a file scan.
  // Keep it alive long enough for that handoff; navigation also releases object URLs.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
