import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { amountInUnit } from '@tsfx/lib/fields/amount-units';
import { formatAmount } from '@tsfx/lib/fields/parse';
import { DEFAULT_UNITS } from '@tsfx/lib/report/types';
import { Popover } from '@tsfx/components/ui/Popover';
import { AmountUnitPicker } from './AmountInput';

/** Compact conversion for read-only amounts, including record facts and detail fields. */
export function AmountValue({ value, label, scale = 2, currency }: { value: string; label: string; scale?: number; currency?: string }) {
  const [unit, setUnit] = useState(DEFAULT_UNITS[0]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!value) return null;
  return <span className="kit-amount-value">
    <span>{formatAmount(amountInUnit(value, unit, scale))}{unit.divisor !== 1 ? ` ${unit.label}` : ''}{currency ? ` ${currency}` : ''}</span>
    <button type="button" className="kit-amount-trigger" aria-label={`Convert ${label}`} title="Convert amount" onClick={e => setAnchor(e.currentTarget)}><ArrowLeftRight size={12} /></button>
    {anchor && <Popover anchor={anchor} onClose={() => setAnchor(null)} autoFocus label={`${label} conversion`}><div className="kit-amount-popover">
      <strong>{label}</strong><AmountUnitPicker label={label} unit={unit} onChange={setUnit} />
      <dl>{DEFAULT_UNITS.map(u => <div key={u.id}><dt>{u.label}</dt><dd>{formatAmount(amountInUnit(value, u, scale))}{currency ? ` ${currency}` : ''}</dd></div>)}</dl>
    </div></Popover>}
  </span>;
}
