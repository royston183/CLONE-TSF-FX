import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { formatAmount, parseAmountInput } from '@tsfx/lib/fields/parse';
import { DEFAULT_UNITS, type Unit } from '@tsfx/lib/report/types';

export function AmountUnitPicker({ label, unit, onChange, disabled }: { label: string; unit: Unit; onChange: (unit: Unit) => void; disabled?: boolean }) {
  return <select className="kit-amount-unit" aria-label={`${label} unit`} title="Amount unit" value={unit.id} disabled={disabled}
    onChange={e => onChange(DEFAULT_UNITS.find(u => u.id === e.target.value)!)}>
    {DEFAULT_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
  </select>;
}

/** Type 1L, 2Cr, 500K, 1M or 1B; Enter/blur expands it into the full, comma-grouped amount. */
export function AmountInput({ value, label, scale = 2, onValue, compact = false, bare = false, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; label: string; scale?: number; onValue: (value: string) => void; compact?: boolean; bare?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { if (focused) input.current?.select(); }, [focused]);
  const canonical = parseAmountInput(value, scale);
  const commit = () => {
    if (!props.readOnly && !props.disabled && canonical !== null && canonical !== value) onValue(canonical);
    setExpanded(true);
  };
  const control = <input {...props} ref={input} type="text" inputMode="text" autoComplete="off" aria-label={props['aria-label'] ?? label}
      title={props.title ?? 'Enter a full amount or use K, L, Cr, M, B (thousand, lakh, crore, million, billion). Enter expands it.'}
      style={{ ...props.style, width: compact && !bare ? '100%' : props.style?.width, textAlign: 'right' }} value={focused && !expanded ? value : formatAmount(canonical ?? value)}
      onFocus={e => { setFocused(true); setExpanded(false); e.target.select(); }}
      onBlur={() => { commit(); setFocused(false); }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { commit(); if (!compact) e.preventDefault(); }
        props.onKeyDown?.(e);
      }}
      onChange={e => { setExpanded(false); onValue(e.target.value); }} />;
  return bare ? control : <span className={`kit-amount${compact ? ' kit-amount-cell' : ''}`}>
    {control}
    {!compact && !props.readOnly && <small className="kit-amount-help">Try 1L, 2Cr, 500K, 1M or 1B. Enter to expand.</small>}
  </span>;
}
