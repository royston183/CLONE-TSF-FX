import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Server, Upload } from 'lucide-react';
import { moduleView, onSampleData, SAMPLE_DATA_NOTE, sourceLabel, uploadCheck, uploadPost } from '@tsfx/lib/client/data';
import { readUpload } from '@tsfx/lib/client/upload-file';
import { downloadFile, sheetXlsx } from '@tsfx/lib/client/xlsx-write';
import { alignOf, formatField, labelOf, typeOf, valueFields } from '@tsfx/lib/fields';
import type { Row, View } from '@tsfx/lib/grid/types';
import { templateHeadings, toFieldValues } from '@tsfx/lib/upload/columns';
import type { AnyUploadDef } from '@tsfx/modules/types';
import { Notice } from '@tsfx/components/ui/Notice';
import { TrafficLightTag } from '@tsfx/components/ui/Badge';
import { Toast, useToast } from '@tsfx/components/ui/Toast';
import { postedRows, UploadDialog, type UploadLine } from '@tsfx/components/ui/UploadDialog';

interface CheckLine { row: number; status: UploadLine['status']; problems: string[]; values: Row }
interface PostResult { created: number; updated: number; invalid: number; duplicate?: number }
const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Upload & preview (spec §6): download the template, upload a file, see the server's preview, post. */
export default function UploadWorkbench({ def }: { def: AnyUploadDef }) {
  const [view, setView] = useState<View | null>(null);
  const [viewError, setViewError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [toast, notify] = useToast();
  // The one file input of this page: the drop area and the Upload File button both open it.
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);
  const fields = useMemo(() => valueFields(def.columns), [def]);
  const maxBytes = def.maxBytes ?? 5 * 1048576, maxRows = def.maxRows ?? 5000;

  useEffect(() => {
    let live = true;
    moduleView(def.id).then(v => { if (live) setView(v); }, (e: Error) => { if (live) setViewError(e.message); });
    return () => { live = false; };
  }, [def.id]);

  async function parse(file: File): Promise<UploadLine[]> {
    const matched = await readUpload(file, def.columns, { maxBytes, maxRows });
    const values = matched.rows.map(r => toFieldValues(def.columns, r, lk));
    const check: { lines: CheckLine[] } = await uploadCheck(def.id, { rows: values });
    return check.lines.map(l => ({
      row: matched.lines[l.row - 1] ?? l.row, status: l.status, problem: l.problems.join(' · '), values: values[l.row - 1],
      cells: Object.fromEntries(fields.map(d => [d.field, formatField(d, l.values, lk)]))
    }));
  }
  /** Posts exactly the rows of the preview on screen (every row: the server re-checks and leaves invalid ones out). */
  async function post(rows: Row[]) {
    setBusy(true);
    try {
      const r: PostResult = await uploadPost(def.id, { rows });
      const text = `${r.created} created, ${r.updated} updated${r.duplicate ? `, ${r.duplicate} duplicate ${r.duplicate === 1 ? 'row' : 'rows'} left out` : ''}${r.invalid ? `, ${r.invalid} invalid ${r.invalid === 1 ? 'row' : 'rows'} left out` : ''}`;
      setResult(text);
      setOpen(false);
      setPicked(null);
      notify(text, 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const accept = ['.xlsx', '.csv'];
  const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
  /** Same checks as the dialog's own file field; a good file opens the dialog, which reads and checks it. Nothing is posted here. */
  const take = (file: File | undefined) => {
    if (!file || !view) return;
    if (!accept.some(ext => file.name.toLowerCase().endsWith(ext))) { setProblem(`Choose a ${accept.join(' or ')} file.`); return; }
    if (file.size > maxBytes) { setProblem(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`); return; }
    setProblem(''); setPicked(file); setOpen(true);
  };
  const browse = () => { if (view) input.current?.click(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); };
  const template = () => downloadFile(`${slug(def.title)}-template.xlsx`, sheetXlsx([templateHeadings(def.columns)], def.title));

  return (
    <section className="panel ds-app">
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>{def.title}</h2>
          {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        </div>
        <div className="ds-actions">
          <button className="button secondary small" onClick={template}><FileSpreadsheet size={14} />Download Template</button>
          <button className="button small" disabled={!view} onClick={browse}><Upload size={15} />Upload File</button>
        </div>
      </div>
      {view?.mode === 'local' && onSampleData(def.id) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {viewError && <Notice error><AlertCircle size={16} />{viewError}</Notice>}
      {result && <Notice><CheckCircle2 size={16} />Posted: {result}.</Notice>}
      <input ref={input} type="file" hidden accept={accept.join(',')} onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <div className={`mc-upload${over ? ' over' : ''}${!view ? ' disabled' : ''}`} role="button" tabIndex={view ? 0 : -1} aria-disabled={!view} aria-label="Choose an Excel or CSV file"
        onClick={browse} onKeyDown={onKey} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <span className="mc-upload__icon"><FileSpreadsheet size={24} /></span>
        <span className="mc-upload__text">
          <b>{picked ? picked.name : 'Choose an Excel or CSV file'}</b>
          <span>{picked ? `${size(picked.size)} · checked before anything is posted` : `Click here or drop a file. Download the template, fill in one row per ${def.noun[0]} and upload it; every row is checked first and nothing is stored until you post.`}</span>
        </span>
      </div>
      {problem && <Notice error><AlertCircle size={16} />{problem}</Notice>}
      <details className="mc-upload__cols"><summary>Template columns</summary><p>{templateHeadings(def.columns).join(', ')}</p></details>
      <p className="panel-note">.xlsx (first worksheet) or .csv · at most {maxRows.toLocaleString('en-US')} rows · {def.strict ? 'posted only when every row is valid' : 'invalid rows are left out'}{def.mode === 'create' ? ' · existing entries are refused' : ''}.</p>
      {open && <UploadDialog title={`Upload ${titleCase(def.noun[1])}`} accept={accept} maxBytes={maxBytes} busy={busy} initialFile={picked ?? undefined}
        columns={fields.map(d => ({ field: d.field, label: labelOf(d), align: alignOf(d.field, fields), type: typeOf(d) === 'amount' ? 'amount' : undefined, scale: d.scale }))} parse={parse} onPost={(_valid, all) => void post(postedRows(all))} onClose={() => { setOpen(false); setPicked(null); }} />}
      <Toast toast={toast} />
    </section>
  );
}
