// src/components/fields/FieldControl.tsx
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Upload } from 'lucide-react';
import { behaviourOf, formatField, labelOf, MONTHS, optionsFor, typeOf, type AnyField } from '@tsfx/lib/fields';
import { formatAmount } from '@tsfx/lib/fields/parse';
import type { Row } from '@tsfx/lib/grid/types';
import { Suggest } from '@tsfx/components/workbench/Suggest';
import { StatusValue } from '@tsfx/components/ui/StatusValue';
import { formSizeOf } from '@tsfx/lib/fields/form-size';
import { AmountInput } from './AmountInput';

export interface FieldControlProps {
  def: AnyField;
  variant: 'form' | 'cell';
  row: Row;
  lk: unknown;
  onChange: (field: string, value: string) => void;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** suggest with valueHelp: opens the F4 dialog. */
  onValueHelp?: () => void;
  /** Extra props for the cell input (data-cell, onPaste, onKeyDown, style) from the grid editor. */
  cellProps?: Record<string, unknown>;
  /** The cleaned row used by computed, lookup and describe; defaults to `row`. */
  context?: Row;
  /** Extra class names of the cell input, e.g. 'md-cell dirty' (ALM's changed-cell look). */
  cellClass?: string;
  /** Props of a period cell's year input (data-cell, onPaste, onKeyDown), so paste and Enter reach it. */
  yearCellProps?: Record<string, unknown>;
  /** file: the picked File itself (the field's value stays the file name). */
  onFile?: (file: File) => void;
  /** A form field's note under its control, e.g. why a read-only field cannot change. */
  hint?: string;
}

/** One control for one field type, in ALM's form (.field) or grid-cell (.ds-cell) look. */
export function FieldControl({ def, variant, row, lk, onChange, error, disabled, readOnly, onValueHelp, cellProps = {}, context, cellClass = '', yearCellProps = {}, onFile, hint }: FieldControlProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const numRef = useRef<HTMLInputElement>(null);
  // Focusing swaps the grouped text for the raw value, which drops the selection; select again once that is rendered.
  const type = typeOf(def);
  const numeric = type === 'amount' || type === 'decimal';
  useLayoutEffect(() => { if (focused && numeric) numRef.current?.select(); }, [focused, numeric]);
  const value = row[def.field] ?? '';
  const bad = Boolean(error);
  const label = labelOf(def);
  const caption = <span>{label}{def.required && <b className="kit-required" aria-hidden="true"> *</b>}</span>;
  const set = (v: string) => onChange(def.field, v);
  const cell = variant === 'cell';
  const sizing = { 'data-field-type': type, 'data-field-size': formSizeOf(def), 'data-field-compact': def.max && def.max <= 6 ? true : undefined };
  // Read-only inputs (a key in edit mode) look locked: kit-readonly mutes them with ALM's tokens.
  const locked = readOnly ? 'kit-readonly' : '';
  const base = {
    id, disabled, readOnly, 'aria-invalid': bad, 'aria-required': def.required || undefined, 'aria-label': label, 'aria-describedby': !cell ? (error ? `${id}-error` : hint ? `${id}-hint` : undefined) : undefined,
    className: cell
      ? `ds-cell ${def.mono || type === 'code' ? 'mono' : ''} ${bad ? 'bad' : ''} ${cellClass} ${locked}`
      : [def.mono || type === 'code' ? 'mono' : '', locked].filter(Boolean).join(' ') || undefined,
    ...cellProps
  };
  const message = error ? <small id={`${id}-error`} className={cell ? 'bad' : 'kit-error'}>{error}</small> : null;
  const wrap = (control: ReactNode, extra?: ReactNode) => (cell
    ? <>{control}{extra}</>
    : type === 'amount'
      ? <div className="field" {...sizing}><label className="kit-field-caption" htmlFor={id}>{caption}</label>{control}{extra}{message}{!message && hint && <small id={`${id}-hint`} className="kit-hint">{hint}</small>}</div>
    : hint
      // The hint describes the control without becoming part of its name (it sits outside the label).
      ? <div className="kit-field-with-hint" {...sizing}><label className="field" htmlFor={id}>{caption}{control}{extra}{message}</label>{!message && <small id={`${id}-hint`} className="kit-hint">{hint}</small>}</div>
      : <label className="field" htmlFor={id} {...sizing}>{caption}{control}{extra}{message}</label>);

  if (type === 'amount') {
    const amount = def.computed ? def.computed(context ?? row, lk) : value;
    return wrap(<AmountInput {...base} value={amount} label={label} scale={def.scale}
      onValue={set} compact={cell} readOnly={readOnly || Boolean(def.computed)} placeholder={def.placeholder ?? '0.00'} />);
  }

  if (def.computed || type === 'display') {
    const shown = formatField(def, context ?? row, lk);
    if (def.statusTone) return <div className={cell ? undefined : 'field'} {...(!cell ? sizing : {})}>{!cell && <span>{label}</span>}<StatusValue definition={def} row={context ?? row}>{shown}</StatusValue></div>;
    return cell
      ? <input {...base} className="ds-cell computed" readOnly tabIndex={-1} value={shown} />
      : <div className="field" {...sizing}><span>{label}</span><span className={`ftr-val ${behaviourOf(def).align === 'right' ? 'num' : 'wide'}`}><StatusValue definition={def} row={context ?? row}>{shown}</StatusValue></span>{hint && <small className="kit-hint">{hint}</small>}</div>;
  }
  if (type === 'flag' || type === 'toggle') {
    const box = <input type="checkbox" id={id} disabled={disabled || readOnly} aria-label={label} checked={value === 'X'} onChange={e => set(e.target.checked ? 'X' : '')} />;
    if (cell) return box;
    return type === 'toggle'
      ? <div className="field" {...sizing}><span>{label}</span><label className="md-toggle">{box}{value === 'X' ? 'On' : 'Off'}</label>{message}</div>
      : <label className="field" {...sizing}><span>{label}</span><span className="md-toggle">{box}{label}</span>{message}</label>;
  }
  if (type === 'select' || type === 'period') {
    const options = type === 'period' ? MONTHS : optionsFor(def, lk);
    // A period's form label also wraps the year input, so the month select names itself.
    const named = type === 'period' && def.yearField && !cell ? { 'aria-label': label } : {};
    const select = <select {...base} {...named} disabled={disabled || readOnly} value={value} onChange={e => set(e.target.value)}><option value="">Select</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    if (type !== 'period' || !def.yearField) return wrap(select);
    // The year looks like its month: read-only, bad and the cell class (dirty) alike.
    const year = <input {...(cell ? yearCellProps : {})} className={base.className} inputMode="numeric" maxLength={4} placeholder="YYYY" aria-label={`${label} year`} disabled={disabled || readOnly}
      value={row[def.yearField] ?? ''} onChange={e => onChange(def.yearField!, e.target.value.replace(/\D/g, ''))} />;
    return wrap(<span className="kit-range">{select}{year}</span>);
  }
  if (type === 'segmented') {
    const seg = (
      <div className="trm-seg" role="radiogroup" aria-label={label}>
        {optionsFor(def, lk).map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled || readOnly} className={value === o.value ? 'on' : ''} onClick={() => set(o.value)}>{o.label}</button>)}
      </div>
    );
    return cell ? seg : <div className="field" {...sizing}><span>{label}</span>{seg}{message}</div>;
  }
  if (type === 'date' || type === 'dateRange') {
    const input = (field: string, aria: string, id = base.id) => <input {...base} id={id} type="date" aria-label={aria} value={row[field] ?? ''} onChange={e => onChange(field, e.target.value)} />;
    if (type === 'date' || !def.toField) return wrap(input(def.field, label));
    return wrap(<span className="kit-range">{input(def.field, `${label} from`)}<span>to</span>{input(def.toField, `${label} to`, `${id}-to`)}</span>);
  }
  if (type === 'textarea') {
    return wrap(<textarea {...base} className="kit-textarea" rows={3} maxLength={def.max} value={value} onChange={e => set(e.target.value)} />,
      def.max ? <span className="kit-counter">{`${value.length} / ${def.max}`}</span> : null);
  }
  if (type === 'file') {
    const drop = <FileField def={def} label={label} value={value} disabled={disabled} onPick={set} onFile={onFile} />;
    return cell ? drop : <div className="field" {...sizing}><span>{label}</span>{drop}{message}</div>;
  }
  if (type === 'suggest' && def.lookup && !readOnly) {
    const items = def.lookup(lk, context ?? row).map(o => ({ value: String(o.CODE), code: String(o.CODE), label: String(o.TEXT) }));
    const suggest = <Suggest {...base} placeholder={def.placeholder ?? 'Search'} maxLength={def.max} value={value} options={items} onText={set} onPick={o => set(o.value)}
      onKeyDown={e => { if (e.key === 'F4' && onValueHelp) { e.preventDefault(); onValueHelp(); return; } (cellProps.onKeyDown as ((e: unknown) => void) | undefined)?.(e); }} />;
    const f4 = def.valueHelp && onValueHelp ? <button type="button" className="icon-button" aria-label={`Search ${label}`} title="Value help (F4)" onClick={onValueHelp}><Search size={15} /></button> : null;
    return wrap(<span className="kit-multi">{suggest}{f4}</span>);
  }
  if (type === 'multiSelect') {
    const options = optionsFor(def, lk);
    const chosen = new Set(value.split(',').filter(Boolean));
    const toggle = (v: string) => { const next = new Set(chosen); if (next.has(v)) next.delete(v); else next.add(v); set(options.map(o => o.value).filter(x => next.has(x)).join(',')); };
    const boxes = <span className="kit-row" role="group" aria-label={label}>{options.map(o => <label key={o.value} className="ds-check"><input type="checkbox" disabled={disabled || readOnly} checked={chosen.has(o.value)} onChange={() => toggle(o.value)} />{o.label}</label>)}</span>;
    return cell ? boxes : <div className="field" {...sizing}><span>{label}</span>{boxes}{message}</div>;
  }
  // text, code, integer, amount, decimal: amounts show grouped while not being edited.
  const shown = numeric && !focused ? formatAmount(value) : value;
  const input = <input ref={numRef} {...base} inputMode={numeric ? 'decimal' : type === 'integer' ? 'numeric' : undefined} maxLength={numeric ? undefined : def.max}
    placeholder={def.placeholder ?? (numeric ? '0.00' : undefined)} style={{ ...(cellProps.style as object), textAlign: behaviourOf(def).align === 'right' ? 'right' : undefined }}
    value={shown} onFocus={() => setFocused(true)}
    onBlur={() => { setFocused(false); if (numeric || type === 'code') { const cleaned = behaviourOf(def).clean(value, def); if (cleaned !== value) set(cleaned); } }}
    onChange={e => set(e.target.value)} />;
  return wrap(input);
}

/** The picked file of a file input, which is emptied so picking the same file again fires a change too. */
export function takeFile(input: { files: FileList | null; value: string }): File | undefined {
  const file = input.files?.[0];
  input.value = '';
  return file;
}

function FileField({ def, label, value, disabled, onPick, onFile }: { def: AnyField; label: string; value: string; disabled?: boolean; onPick: (name: string) => void; onFile?: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const take = (file: File | undefined) => {
    if (!file || disabled) return;
    const wrongType = def.accept?.length && !def.accept.some(ext => file.name.toLowerCase().endsWith(ext.toLowerCase()));
    if (wrongType) { setProblem(`Choose a ${def.accept!.join(' or ')} file.`); return; }
    if (def.maxBytes && file.size > def.maxBytes) { setProblem(`The file is larger than ${Math.round(def.maxBytes / 1048576)} MB.`); return; }
    setProblem('');
    onPick(file.name);
    onFile?.(file);
  };
  return (
    <>
      <label htmlFor={inputId} className={`kit-drop ${over ? 'over' : ''}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={`Choose ${label} file`}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
        <Upload size={20} />
        {value ? <b>{value}</b> : <span>Drop a file here or <b>browse</b></span>}
        {def.accept?.length ? <span>{def.accept.join(', ')}{def.maxBytes ? ` · up to ${Math.round(def.maxBytes / 1048576)} MB` : ''}</span> : null}
        <input ref={inputRef} id={inputId} type="file" hidden disabled={disabled} accept={def.accept?.join(',')} onChange={e => take(takeFile(e.target))} />
      </label>
      {problem && <small className="kit-error" role="alert">{problem}</small>}
    </>
  );
}
