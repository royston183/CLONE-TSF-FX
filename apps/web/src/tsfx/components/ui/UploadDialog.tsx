import { DataTable, columnsFor } from '@tsfx/components/table/DataTable';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { FieldControl } from '@tsfx/components/fields/FieldControl';
import { alignClass } from '@tsfx/lib/fields';
import { amountInUnit } from '@tsfx/lib/fields/amount-units';
import { formatAmount } from '@tsfx/lib/fields/parse';
import { DEFAULT_UNITS } from '@tsfx/lib/report/types';
import { AmountUnitPicker } from '@tsfx/components/fields/AmountInput';
import type { Row } from '@tsfx/lib/grid/types';
import { StatusBadge } from './Badge';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { DialogSection } from './DialogSection';
import { WizardSteps } from './WizardSteps';

export interface UploadLine {
  /** `duplicate`: already stored (or repeated in the file); `invalid`: any other problem. Neither is posted. */
  row: number; status: 'create' | 'update' | 'invalid' | 'duplicate'; cells: Record<string, string>; problem?: string;
  /** The converted file row this line previews; posted as is, so Post always sends the file on screen. */
  values?: Row;
}
type Filter = 'all' | UploadLine['status'];
const FILTERS: [Filter, string][] = [['all', 'All'], ['create', 'New'], ['update', 'Update'], ['duplicate', 'Duplicate'], ['invalid', 'Invalid']];
/** The rows that will be posted. */
const isPostable = (l: UploadLine) => l.status === 'create' || l.status === 'update';

/** Runs one parse per pick and settles only the latest pick: a slower, older parse that resolves late is dropped. */
export function latestPick<T>() {
  let seq = 0;
  return (work: Promise<T>, done: (result: T) => void, fail: (error: Error) => void) => {
    const my = ++seq;
    work.then(r => { if (my === seq) done(r); }, (e: Error) => { if (my === seq) fail(e); });
  };
}

/** The rows a post sends: the values of the lines on screen, in file order. */
export const postedRows = (lines: UploadLine[]): Row[] => lines.flatMap(l => (l.values ? [l.values] : []));

/** Pick a file, preview every row with its status and problem (ALM .trm-seg filter, .tb-table), then post the valid rows. */
export function UploadDialog({ title, accept, maxBytes, columns, parse, onPost, onClose, busy = false }: {
  title: string; accept: string[]; maxBytes: number; columns: { field: string; label: string; align?: 'left' | 'right'; type?: 'amount'; scale?: number }[];
  /** Reads the picked file and returns its checked rows (the server's preview). */
  parse: (file: File) => Promise<UploadLine[]>;
  /** `valid`: the lines that will be stored; `all`: every line on screen (see `postedRows`). */
  onPost: (valid: UploadLine[], all: UploadLine[]) => void; onClose: () => void; busy?: boolean;
}) {
  const [file, setFile] = useState('');
  const [lines, setLines] = useState<UploadLine[] | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [unit, setUnit] = useState(DEFAULT_UNITS[0]);
  const [settle] = useState(() => latestPick<UploadLine[]>());
  const valid = lines?.filter(isPostable) ?? [];
  const duplicates = lines?.filter(l => l.status === 'duplicate').length ?? 0;
  const shown = lines?.filter(l => filter === 'all' || l.status === filter) ?? [];
  const pick = (f: File) => {
    setFile(f.name);
    setLines(null);
    setError('');
    setFilter('all');
    setReading(true);
    settle(parse(f),
      l => { setLines(l); setReading(false); },
      e => { setLines(null); setError(e.message); setReading(false); }
    );
  };
  return (
    <Modal title={title} subtitle="Choose a file, review the checked rows, then post the valid entries." wide onClose={onClose} busy={busy || reading} footer={<>
      {lines && <span className="ds-foot-hint">{valid.length} of {lines.length} rows ready</span>}
      <button className="button secondary" disabled={busy || reading} onClick={onClose}>Cancel</button>
      <button className="button" disabled={busy || reading || !valid.length} onClick={() => onPost(valid, lines ?? [])}>{busy ? 'Posting…' : `Post ${valid.length} Rows`}</button>
    </>}>
      <WizardSteps steps={['Choose file', 'Review rows', 'Post entries']} current={busy ? 2 : lines ? 1 : 0} />
      <DialogSection title="Source file" description={`Accepted formats: ${accept.join(', ')} · Maximum ${Math.round(maxBytes / 1048576)} MB`}>
        <FieldControl def={{ field: 'file', label: 'File', type: 'file', accept, maxBytes }} variant="form" row={{ file }} lk={{}} onChange={() => undefined} onFile={pick} disabled={busy || reading} />
      </DialogSection>
      {reading && <p className="td-muted">Reading and checking {file}…</p>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {lines && <DialogSection title="Review entries" description={`${valid.length} valid · ${duplicates ? `${duplicates} duplicate · ` : ''}${lines.length - valid.length - duplicates} invalid. Only valid rows will be posted.`}>
      {columns.some(c => c.type === 'amount') && <div className="kit-amount-toolbar"><span>Amounts in</span><AmountUnitPicker label="Upload amounts" unit={unit} onChange={setUnit} /></div>}
      <div className="ds-filters"><div className="trm-seg" role="radiogroup" aria-label="Rows">{FILTERS.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
          {label} {id === 'all' ? lines.length : lines.filter(l => l.status === id).length}
        </button>
      ))}</div></div>
      <div className="ds-grid-wrap"><DataTable columns={[{ kind: 'number' }, { kind: 'text', width: 108 }, ...columnsFor(columns), { kind: 'text' }]} className="ds-table tb-table">
        <thead><tr><th>Row</th><th>Status</th>{columns.map(c => <th key={c.field} className={alignClass(c.align ?? 'left') || undefined}>{c.label}</th>)}<th>Problem</th></tr></thead>
        <tbody>{shown.map(l => (
          <tr key={l.row} className={isPostable(l) ? '' : 'tb-bad'}>
            <td>{l.row}</td><td><StatusBadge status={l.status} /></td>{columns.map(c => <td key={c.field} className={alignClass(c.align ?? 'left') || undefined}>{c.type === 'amount' ? formatAmount(amountInUnit(l.values?.[c.field] ?? l.cells[c.field], unit, c.scale)) : l.cells[c.field]}</td>)}<td className="tb-wide">{l.problem}</td>
          </tr>
        ))}</tbody>
      </DataTable></div>
      </DialogSection>}
    </Modal>
  );
}
