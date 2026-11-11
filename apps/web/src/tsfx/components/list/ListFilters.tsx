// src/components/list/ListFilters.tsx
import { labelOf, optionsFor, typeOf } from '@tsfx/lib/fields';
import { filterOp } from '@tsfx/lib/list/pagination';
import type { AnyList } from '@tsfx/lib/list/types';
import { FilterCombo } from '@tsfx/components/workbench/FilterCombo';
import { AmountInput } from '@tsfx/components/fields/AmountInput';

/** ALM's filter bar for a large list: type-ahead for codes, from–to for dates and amounts, contains for text. */
export function ListFilters({ list, lk, values, onChange }: { list: AnyList; lk: unknown; values: Record<string, string[]>; onChange: (values: Record<string, string[]>) => void }) {
  const set = (field: string, v: string[]) => onChange({ ...values, [field]: v });
  return (
    <>
      {(list.filters ?? []).map(field => {
        const d = list.fields.find(x => x.field === field);
        if (!d) return null;
        const v = values[field] ?? [];
        const label = labelOf(d);
        const t = typeOf(d);
        const pick = (options: { value: string; label: string }[]) =>
          <FilterCombo key={field} all={`All ${label}`} options={options} value={v[0] ?? ''} onChange={x => set(field, x ? [x] : [])} />;
        if (t === 'flag' || t === 'toggle') return pick([{ value: 'X', label: 'Yes' }, { value: '-', label: 'No' }]);
        if (t === 'select' || t === 'segmented') return pick(optionsFor(d, lk));
        if (t === 'suggest' && d.lookup) return pick(d.lookup(lk, {}).map(i => ({ value: String(i.CODE), label: `${i.CODE} - ${i.TEXT}` })));
        if (filterOp(d) === 'between') {
          const date = t === 'date';
          return (
            <span key={field} className="kit-range kit-filter" role="group" aria-label={label}>
              <span>{label}</span>
              {t === 'amount' ? <AmountInput bare compact label={`${label} from`} scale={d.scale} placeholder="From" value={v[0] ?? ''} onValue={value => set(field, [value, v[1] ?? ''])} />
                : <input type={date ? 'date' : 'text'} inputMode={date ? undefined : 'decimal'} aria-label={`${label} from`} placeholder="From" value={v[0] ?? ''} onChange={e => set(field, [e.target.value, v[1] ?? ''])} />}
              <span>to</span>
              {t === 'amount' ? <AmountInput bare compact label={`${label} to`} scale={d.scale} placeholder="To" value={v[1] ?? ''} onValue={value => set(field, [v[0] ?? '', value])} />
                : <input type={date ? 'date' : 'text'} inputMode={date ? undefined : 'decimal'} aria-label={`${label} to`} placeholder="To" value={v[1] ?? ''} onChange={e => set(field, [v[0] ?? '', e.target.value])} />}
            </span>
          );
        }
        return <span key={field} className="kit-filter"><input aria-label={label} placeholder={label} value={v[0] ?? ''} onChange={e => set(field, e.target.value ? [e.target.value] : [])} /></span>;
      })}
    </>
  );
}
