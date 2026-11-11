import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Option } from '@tsfx/lib/grid/types';
import { Suggest } from './Suggest';

/** Type-ahead filter of the filter bar ("All Frequency Types"). */
export function FilterCombo({ all, options, value, onChange }: { all: string; options: Option[]; value: string; onChange: (value: string) => void }) {
  const label = options.find(o => o.value === value)?.label ?? '';
  const [text, setText] = useState(label);
  const [shown, setShown] = useState(label);
  // Follow a selection changed from outside (Reset) by adjusting state during render, not in an effect.
  if (label !== shown) { setShown(label); setText(label); }
  return (
    <label className="ds-combo">
      <Suggest aria-label={all} placeholder={all} value={text} options={[{ value: '', label: all }, ...options]}
        onText={t => { setText(t); if (!t.trim() && value) onChange(''); }}
        onPick={o => { setText(o.value ? o.label : ''); onChange(o.value); }} />
      <ChevronDown size={14} />
    </label>
  );
}
