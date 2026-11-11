// src/components/report/LayoutPicker.tsx
import type { ActiveLayout } from '@tsfx/lib/layout/alv-types';
import type { SavedLayout } from '@tsfx/lib/report/types';

const valueOf = (l: { scope: string; name: string }) => `${l.scope}:${l.name}`;

/** ALM's layout picker (.trm-layout-pick): the Standard layout, shared layouts, then "My layouts"; * marks a changed view. */
export function LayoutPicker({ layouts, active, modified, onSelect }: { layouts: SavedLayout[]; active: ActiveLayout | null; modified: boolean; onSelect: (saved: SavedLayout | null) => void }) {
  const text = (l: SavedLayout) => `${l.name}${l.isDefault ? ' (default)' : ''}${modified && active?.scope === l.scope && active.name === l.name ? ' *' : ''}`;
  const option = (l: SavedLayout) => <option key={valueOf(l)} value={valueOf(l)} title={l.description || undefined}>{text(l)}</option>;
  const personal = layouts.filter(l => l.scope === 'personal');
  return (
    <label className="trm-layout-pick" title={modified ? 'Changed since it was selected or saved' : 'Layout in use'}><span>Layout</span>
      <select aria-label="Layout" value={active ? valueOf(active) : ''} onChange={e => onSelect(layouts.find(l => valueOf(l) === e.target.value) ?? null)}>
        <option value="">{`Standard layout${modified && !active ? ' *' : ''}`}</option>
        {layouts.filter(l => l.scope === 'shared').map(option)}
        {personal.length > 0 && <optgroup label="My layouts">{personal.map(option)}</optgroup>}
      </select>
    </label>
  );
}
