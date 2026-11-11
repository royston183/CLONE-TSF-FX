/** The most frequent unquoted tab, ';' or ',' on the first non-empty line (up to its first unquoted line break); ties go to ','. */
function detectDelimiter(src: string): string {
  const count: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false, seen = false;
  for (const ch of src) {
    if (ch === '"') { quoted = !quoted; seen = true; }
    else if (!quoted && (ch === '\n' || ch === '\r')) { if (seen) break; }
    else if (!quoted && ch in count) { count[ch]++; seen = true; }
    else if (quoted || !/\s/.test(ch)) seen = true;
  }
  return (['\t', ';'] as const).reduce((best, d) => (count[d] > count[best] ? d : best), ',');
}

/** CSV / TSV text as rows of cells (ported from ALM): quotes as Excel writes them; the delimiter is the most frequent unquoted tab, ';' or ',' in the heading line. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a byte-order mark
  const delim = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Rows of cells as CSV: a cell with a quote, comma or line break is quoted (quotes doubled); lines end with CRLF. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}
