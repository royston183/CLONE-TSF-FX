import { DataTable, columnsFor } from '@tsfx/components/table/DataTable';
// src/components/grid/EditGrid.tsx
import { Fragment, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { behaviourOf, isFlag, labelOf, typeOf, type AnyField } from '@tsfx/lib/fields';
import { keepKeys } from '@tsfx/lib/grid/edit-rows';
import { pasteInto } from '@tsfx/lib/grid/grid';
import type { GridRow, Row } from '@tsfx/lib/grid/types';
import { FieldControl } from '@tsfx/components/fields/FieldControl';
import { ValueHelpDialog } from '@tsfx/components/ui/ValueHelpDialog';

export interface FooterRow { label: string; values: Record<string, string> }

function widthOf(c: AnyField): number {
  const t = typeOf(c);
  if (isFlag(c)) return 56;
  if (t === 'date') return 140;
  if (t === 'dateRange') return 290;
  if (['select', 'segmented', 'period'].includes(t)) return c.width ?? 130;
  if (t === 'amount' || t === 'decimal') return c.width ?? 140;
  return c.width ?? Math.min(Math.max(Math.round((c.max ?? 12) * (c.mono || t === 'code' ? 8 : 7) + 22), 76), 240);
}
const toRow = (g: GridRow | undefined): Row => Object.fromEntries(Object.entries(g?.values ?? {}).map(([f, x]) => [f, typeof x === 'boolean' ? (x ? 'X' : '') : x]));

/** An inline grid of typed cells: add and remove rows, paste from Excel, Enter moves down, F4 opens the value help. */
export function EditGrid({ fields, rows, onRows, lk, problems, newRow, ariaLabel, cellClass, footer = [], className = '', canAdd = true }: {
  fields: AnyField[]; rows: GridRow[]; onRows: (rows: GridRow[]) => void; lk: unknown;
  /** Grid index → field → problem ('required' only highlights; a sentence also shows under the row). */
  problems: Record<number, Record<string, string>>;
  /** A new row; `offset` counts the rows already added by the same paste. */
  newRow: (rows: GridRow[], offset: number) => GridRow;
  ariaLabel: string;
  cellClass?: (row: GridRow, def: AnyField) => string;
  footer?: FooterRow[];
  className?: string;
  canAdd?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState<{ id: number; def: AnyField } | null>(null);
  const first = fields.find(f => !f.computed && typeOf(f) !== 'display')?.field ?? fields[0]?.field ?? '';
  const focusCell = (i: number, field: string) => setTimeout(() => body.current?.querySelector<HTMLElement>(`[data-cell="${i}:${field}"]`)?.focus(), 0);
  const set = (id: number, field: string, value: string | boolean) => onRows(rows.map(r => (r.id === id ? { ...r, values: { ...r.values, [field]: value } } : r)));
  const add = () => { onRows([...rows, newRow(rows, 0)]); focusCell(rows.length, first); };
  function paste(e: ClipboardEvent<HTMLElement>, i: number, field: string) {
    let made = 0;
    const next = pasteInto({ grid: fields }, canAdd ? 'add' : 'edit', rows, i, field, e.clipboardData?.getData('text') ?? '', lk, () => newRow(rows, made++));
    if (!next) return;
    e.preventDefault();
    onRows(keepKeys(fields, next));
  }
  function enter(e: KeyboardEvent<HTMLElement>, i: number, field: string) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (i === rows.length - 1 && canAdd) onRows([...rows, newRow(rows, 0)]);
    focusCell(i + 1, field);
  }
  const helpRow = help ? rows.find(r => r.id === help.id) : undefined;
  return (
    <>
      <div className="ds-grid-wrap" ref={body}>
        <DataTable columns={[...columnsFor(fields, fields), ...(canAdd ? [{ kind: 'actions' as const }] : [])]} className={`ds-table ds-grid ${className}`} aria-label={ariaLabel}>
          <thead><tr>
            {fields.map(c => <th key={c.field} className={isFlag(c) ? 'ds-flag' : behaviourOf(c).align === 'right' ? 'md-amt' : ''}>{c.label}</th>)}
            {canAdd && <th className="ds-rm-col" aria-label="Remove" />}
          </tr></thead>
          <tbody>{rows.map((g, i) => {
            const bad = problems[i] ?? {};
            const note = [...new Set(Object.values(bad).filter(p => p.includes(' ')))].join(' · ');
            const row = toRow(g);
            return (
              <Fragment key={g.id}>
                <tr>
                  {fields.map(c => (
                    <td key={c.field} className={isFlag(c) ? 'ds-flag' : ''}>
                      <FieldControl def={c} variant="cell" row={row} lk={lk} readOnly={Boolean(c.key && g.orig)}
                        error={bad[c.field] || (c.toField && bad[c.toField]) || (c.yearField && bad[c.yearField]) || undefined}
                        cellClass={cellClass?.(g, c) ?? ''}
                        onChange={(field, value) => set(g.id, field, isFlag(c) ? value === 'X' : value)}
                        onValueHelp={c.valueHelp && c.lookup ? () => setHelp({ id: g.id, def: c }) : undefined}
                        cellProps={{
                          'data-cell': `${i}:${c.field}`, 'aria-label': `${c.label}, row ${i + 1}`, style: { width: widthOf(c) },
                          onPaste: (e: ClipboardEvent<HTMLElement>) => paste(e, i, c.field),
                          onKeyDown: (e: KeyboardEvent<HTMLElement>) => enter(e, i, c.field)
                        }}
                        yearCellProps={c.yearField ? {
                          'data-cell': `${i}:${c.yearField}`,
                          onPaste: (e: ClipboardEvent<HTMLElement>) => paste(e, i, c.yearField ?? ''),
                          onKeyDown: (e: KeyboardEvent<HTMLElement>) => enter(e, i, c.yearField ?? '')
                        } : undefined} />
                    </td>
                  ))}
                  {canAdd && <td className="ds-rm-col"><button type="button" className="icon-button" aria-label={`Remove row ${i + 1}`} onClick={() => onRows(rows.filter(r => r.id !== g.id))}><X size={15} /></button></td>}
                </tr>
                {note && <tr className="ds-row-msg"><td colSpan={fields.length + 1}>{note}</td></tr>}
              </Fragment>
            );
          })}</tbody>
          {footer.length > 0 && <tfoot>{footer.map((f, n) => (
            <tr key={n}>{fields.map((c, j) => <td key={c.field} className={behaviourOf(c).align === 'right' ? 'md-amt md-total' : ''}>{f.values[c.field] ?? (j === 0 ? f.label : '')}</td>)}{canAdd && <td />}</tr>
          ))}</tfoot>}
        </DataTable>
      </div>
      {canAdd && <button type="button" className="button secondary small ds-add-row" onClick={add}><Plus size={15} />Add Row</button>}
      {help?.def.lookup && <ValueHelpDialog title={`Select ${labelOf(help.def)}`} items={help.def.lookup(lk, toRow(helpRow))} onClose={() => setHelp(null)}
        onPick={code => { set(help.id, help.def.field, code); setHelp(null); }} />}
    </>
  );
}
