import { DataTable, columnsFor } from '@tsfx/components/table/DataTable';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AlertCircle, Plus, X } from 'lucide-react';
import { moduleChange } from '@tsfx/lib/client/data';
import type { HttpError } from '@tsfx/lib/errors';
import { useSort } from '@tsfx/lib/client/use-sort';
import { pasteInto, rowsToSave, str, validateGrid } from '@tsfx/lib/grid/grid';
import type { Checked, GridColumn, GridRow, Mode, Row, TabDef, View } from '@tsfx/lib/grid/types';
import type { ModuleDef, OpenMode } from '@tsfx/modules/types';
import { FieldControl } from '@tsfx/components/fields/FieldControl';
import { formatField, isFlag, labelOf, typeOf } from '@tsfx/lib/fields';
import { FootActions, Modal, modalStack, RecordHeading, useSaveShortcut } from '@tsfx/components/ui/Modal';
import { Notice } from '@tsfx/components/ui/Notice';
import { SortTh } from '@tsfx/components/ui/SortTh';
import { ValueHelpDialog } from '@tsfx/components/ui/ValueHelpDialog';
import { DialogSection } from '@tsfx/components/ui/DialogSection';
import { WizardSteps } from '@tsfx/components/ui/WizardSteps';

export interface SavedView extends View { result: { created: number; updated: number; deleted: number; skipped: number } }
export const entries = (n: number) => `${n} ${n === 1 ? 'Entry' : 'Entries'}`;
let nextId = 1;
/** A new grid row. Call it from event handlers only (it advances a counter). */
export const gridRow = (values: GridRow['values'] = {}, orig?: Row): GridRow => ({ id: nextId++, values, orig });

/**
 * Input width fitted to the data: the longest value in the table or typed into the grid (plus one character),
 * never narrower than the heading nor wider than the field's SAP length.
 */
function cellWidth<L>(c: GridColumn<L>, fit: Record<string, number>): number {
  if (isFlag(c)) return 56;
  if (['select', 'segmented', 'period'].includes(typeOf(c))) return c.width ?? 130;
  if (typeOf(c) === 'dateRange') return 290;
  if (typeOf(c) === 'date') return 140;
  const cap = c.max ? Math.min(Math.round(c.max * (c.mono ? 8 : 7) + 22), 210) : c.width ?? 210;
  const chars = Math.max(fit[c.field] ?? c.max ?? 0, c.label.length, c.lookup ? 6 : 2);
  return Math.min(Math.max(Math.round(chars * (c.mono ? 8 : 7) + 22), c.lookup ? 76 : 52), cap);
}
const longest = (values: unknown[]) => values.reduce<number>((n, v) => Math.max(n, str(v).length), 0);

/** Row-level text for problems a highlighted cell alone does not explain. */
function rowMessage(bad: Record<string, string>): string {
  const problems = Object.values(bad);
  if (problems.includes('exists')) return 'This entry already exists.';
  if (problems.includes('duplicate')) return 'Duplicate of another row in this grid.';
  if (problems.includes('missing')) return 'This entry no longer exists.';
  return problems.find(p => p.includes(' ')) ?? '';
}

interface Props<L> {
  def: ModuleDef<L>;
  tab: TabDef<L>;
  mode: Mode;
  initial: GridRow[];
  tableRows: Row[];
  lk: L;
  /** How it shows: a pop-up, a pop-up with the step strip (wizard), or a page in place of the table. */
  frame: OpenMode;
  onClose: () => void;
  onSaved: (result: SavedView, mode: Mode) => void;
}

const noDialogOpen = () => modalStack.size() === 0;

/** Add / edit grid with paste-from-Excel, value help, live validation and a confirmation step for edits (and for adds in a wizard). */
export function GridEditor<L>({ def, tab, mode, frame, initial, tableRows, lk, onClose, onSaved }: Props<L>) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [rows, setRows] = useState(initial);
  const [step, setStep] = useState<'grid' | 'confirm'>('grid');
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({});
  const [message, setMessage] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [help, setHelp] = useState<{ id: number; def: GridColumn<L>; row: Row } | null>(null);
  const checked = useMemo(() => validateGrid(tab, rows, tableRows, mode, lk), [tab, rows, tableRows, mode, lk]);
  const ready = checked.filter(r => r.valid && r.changed);
  const stored = useMemo(() => Object.fromEntries(tab.grid.filter(c => !c.computed).map(c => [c.field, longest(tableRows.map(r => r[c.field]))])), [tab, tableRows]);
  const fit: Record<string, number> = Object.fromEntries(tab.grid.map(c => [c.field, Math.max(stored[c.field] ?? 0, longest(checked.map(r => (c.computed ? c.computed(r.row, lk) : r.row[c.field])))) + 1]));
  const cellText = (c: GridColumn<L>, r: Checked) => formatField(c, r.row, lk);
  const review = useSort(ready, (r, f) => { const c = tab.grid.find(x => x.field === f); return c ? cellText(c, r) : ''; });
  // Strict modules (as their legacy screen did) save nothing while any filled row is invalid.
  const invalid = checked.filter(r => !r.blank && !r.valid).length;
  const blocked = def.strict && invalid > 0;

  const set = (id: number, field: string, value: string | boolean) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, values: { ...r.values, [field]: value } } : r)));
    setServerErrors(e => Object.fromEntries(Object.entries(e).filter(([k]) => Number(k) !== id)));
  };
  const focusCell = (rowIndex: number, field: string) => setTimeout(() => body.current?.querySelector<HTMLElement>(`[data-cell="${rowIndex}:${field}"]`)?.focus(), 0);
  function paste(e: ClipboardEvent<HTMLElement>, rowIndex: number, field: string) {
    const next = pasteInto(tab, mode, rows, rowIndex, field, e.clipboardData?.getData('text') ?? '', lk, () => gridRow());
    if (!next) return;
    e.preventDefault();
    setRows(next);
  }
  function onEnter(e: KeyboardEvent<HTMLElement>, rowIndex: number, field: string) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (rowIndex === rows.length - 1 && mode === 'add') setRows([...rows, gridRow()]);
    focusCell(rowIndex + 1, field);
  }
  async function save() {
    if (!ready.length || blocked || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result: SavedView = await moduleChange(def.id, tab.id, mode === 'add' ? 'create' : 'update', rowsToSave(ready, rows));
      onSaved(result, mode);
    } catch (error) {
      const err = error as HttpError;
      const byRow: Record<number, string[]> = {};
      for (const d of err.details ?? []) {
        const id = d.row ? ready[d.row - 1]?.id : undefined;
        if (id !== undefined) (byRow[id] ??= []).push(d.message);
      }
      setServerErrors(byRow);
      setMessage(err.message);
      setStep('grid');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const reviews = mode === 'edit' || frame === 'wizard';
  const primary = () => {
    if (!ready.length || blocked) return;
    // Edits, and new rows entered in a wizard, are reviewed before they are saved.
    if (reviews && step === 'grid') setStep('confirm');
    else void save();
  };
  // A page takes the table's place: Ctrl+S answers while no dialog is open on top, and its heading is focused and shown on open.
  useSaveShortcut(frame === 'page' ? primary : undefined, busy, noDialogOpen);
  useEffect(() => {
    if (frame !== 'page') return;
    heading.current?.focus();
    heading.current?.scrollIntoView?.();
  }, [frame]);

  function renderCell(c: GridColumn<L>, g: GridRow, v: Checked, i: number) {
    const locked = mode === 'edit' && Boolean(c.key);
    const bad = Boolean(v.bad[c.field]) && !v.blank;
    // The grid keeps typed text as typed (flags as booleans); the control works on strings.
    const row: Row = Object.fromEntries(Object.entries(g.values).map(([f, x]) => [f, typeof x === 'boolean' ? (x ? 'X' : '') : x]));
    return (
      <FieldControl def={c} variant="cell" row={row} context={v.row} lk={lk} readOnly={locked} error={bad ? 'required' : undefined}
        onChange={(field, value) => set(g.id, field, isFlag(c) ? value === 'X' : value)}
        onValueHelp={c.valueHelp && c.lookup ? () => setHelp({ id: g.id, def: c, row: v.row }) : undefined}
        yearCellProps={c.yearField ? {
          'data-cell': `${i}:${c.yearField}`,
          onPaste: (e: ClipboardEvent<HTMLElement>) => paste(e, i, c.yearField ?? ''),
          onKeyDown: (e: KeyboardEvent<HTMLElement>) => onEnter(e, i, c.yearField ?? '')
        } : undefined}
        cellProps={{
          'data-cell': `${i}:${c.field}`,
          'aria-label': `${c.label}, row ${i + 1}`,
          style: { width: cellWidth(c, fit) },
          onPaste: (e: ClipboardEvent<HTMLElement>) => paste(e, i, c.field),
          onKeyDown: (e: KeyboardEvent<HTMLElement>) => onEnter(e, i, c.field)
        }} />
    );
  }

  const title = step === 'confirm' ? (mode === 'add' ? 'Confirm Add' : 'Confirm Update') : mode === 'add' ? `Add ${tab.noun[1]}` : `Edit ${rows.length > 1 ? tab.noun[1] : tab.noun[0]}`;
  const footer = step === 'confirm'
    ? <>
      <button className="button secondary" disabled={busy} onClick={() => setStep('grid')}>Back</button>
      <button className="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : `Yes, ${mode === 'add' ? 'Add' : 'Update'} ${entries(ready.length)}`}</button>
    </>
    : <>
      {mode === 'add' && <button className="button secondary ds-add-row" onClick={() => { setRows([...rows, gridRow()]); focusCell(rows.length, tab.grid[0].field); }}><Plus size={15} />Add Row</button>}
      <span className={`ds-foot-hint ${blocked ? 'bad' : ''}`}>{blocked ? `Fix ${invalid} highlighted ${invalid === 1 ? 'row' : 'rows'} to save` : mode === 'add' ? `Paste rows from Excel into any cell · Ctrl+S ${reviews ? 'reviews' : 'saves'}` : 'Ctrl+S reviews changes'}</span>
      <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="button" disabled={busy || !ready.length || blocked} onClick={primary}>{busy ? 'Saving…' : `${mode === 'edit' ? 'Update' : 'Add'} ${ready.length ? entries(ready.length) : 'Entries'}`}</button>
    </>;

  const content = (
    <>
      {frame === 'wizard' && <WizardSteps steps={['Edit entries', 'Review changes', 'Save']} current={busy ? 2 : step === 'confirm' ? 1 : 0} />}
      {message && <Notice error><AlertCircle size={16} />{message}</Notice>}
      <DialogSection title={step === 'confirm' ? 'Review entries' : 'Entry details'} description={step === 'confirm' ? `Check the ${mode === 'add' ? 'new' : 'updated'} values before saving.` : 'Enter the values below. Fields marked * are required.'}>
      {step === 'confirm'
        ? <div className="ds-grid-wrap"><DataTable nativeLayout nativeExport columns={columnsFor(tab.grid, tab.grid)} className="ds-table">
          <thead><tr>{tab.grid.map(c => <SortTh key={c.field} col={c.field} sort={review.sort} onSort={review.toggle}>{c.label}</SortTh>)}</tr></thead>
          <tbody>{review.rows.map(r => <tr key={r.id}>{tab.grid.map(c => <td key={c.field} className={c.mono ? 'ds-code' : ''}>{cellText(c, r)}{r.desc[c.field] && <small>{r.desc[c.field]}</small>}</td>)}</tr>)}</tbody>
        </DataTable></div>
        : <div className="ds-grid-wrap" ref={body}><DataTable nativeLayout nativeExport columns={[...columnsFor(tab.grid, tab.grid), ...(mode === 'add' ? [{ kind: 'actions' as const }] : [])]} className="ds-table ds-grid">
          <thead><tr>{tab.grid.map(c => <th key={c.field} className={isFlag(c) ? 'ds-flag' : ''} style={{ width: cellWidth(c, fit) + (c.describe ? 150 : 0) }}>{c.label}</th>)}{mode === 'add' && <th className="ds-rm-col" aria-label="Remove" />}</tr></thead>
          <tbody>{rows.map((g, i) => {
            const v = checked[i];
            const note = serverErrors[g.id]?.join(' · ') || (!v.blank ? rowMessage(v.bad) : '');
            return (
              <Fragment key={g.id}>
                <tr className={v.valid && v.changed ? 'ready' : ''}>
                  {tab.grid.map(c => <td key={c.field} className={isFlag(c) ? 'ds-flag' : ''}><div className="ds-inline">{renderCell(c, g, v, i)}{c.describe && <small className={v.bad[c.field] && !v.blank ? 'bad' : ''} title={v.desc[c.field]}>{v.desc[c.field]}</small>}</div></td>)}
                  {mode === 'add' && <td className="ds-rm-col"><button className="icon-button" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter(r => r.id !== g.id) : [gridRow()])}><X size={15} /></button></td>}
                </tr>
                {note && <tr className="ds-row-msg"><td colSpan={tab.grid.length + 1}>{note}</td></tr>}
              </Fragment>
            );
          })}</tbody>
        </DataTable></div>}
      </DialogSection>
      {help?.def.lookup && <ValueHelpDialog title={`Select ${labelOf(help.def)}`} items={help.def.lookup(lk, help.row)} onClose={() => setHelp(null)}
        onPick={code => { set(help.id, help.def.field, code); setHelp(null); }} />}
    </>
  );

  if (frame === 'page') {
    return (
      <div className="kit-grid-page" aria-labelledby={titleId} aria-busy={busy}>
        <header className="kit-grid-page-head"><RecordHeading title={title} subtitle={tab.title} titleId={titleId} titleRef={heading} /></header>
        <div className="kit-grid-page-body">{content}</div>
        <FootActions className="kit-grid-page-foot" footer={footer} />
      </div>
    );
  }
  return (
    <Modal wide title={title} subtitle={tab.title} onClose={onClose} busy={busy} onPrimary={primary} onEnter={step === 'confirm' ? () => void save() : undefined} footer={footer}>
      {content}
    </Modal>
  );
}
