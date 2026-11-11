import { DataTable } from '@tsfx/components/table/DataTable';
import { useState } from 'react';
import { behaviourOf, formatField, labelOf, typeOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import { amountInUnit } from '@tsfx/lib/fields/amount-units';
import { formatAmount } from '@tsfx/lib/fields/parse';
import { DEFAULT_UNITS } from '@tsfx/lib/report/types';
import { AmountUnitPicker } from '@tsfx/components/fields/AmountInput';
import type { Row } from '@tsfx/lib/grid/types';
import { Modal } from './Modal';
import { DialogSection } from './DialogSection';
import { WizardSteps } from './WizardSteps';

/** The value fields whose canonical value differs between two versions of a record. */
export function changedFields(fields: AnyField[], before: Row, after: Row): AnyField[] {
  return valueFields(fields).filter(d => behaviourOf(d).clean(before[d.field] ?? '', d) !== behaviourOf(d).clean(after[d.field] ?? '', d));
}

/** Field / Current / New for every changed field, plus a summary of other changes, before saving (ALM's deal-edit confirmation). */
export function ReviewDialog({ title, fields, before, after, lk, busy = false, confirmLabel = 'Yes, Save Changes', summary = [], onConfirm, onBack }: {
  title: string; fields: AnyField[]; before: Row; after: Row; lk: unknown; busy?: boolean; confirmLabel?: string;
  /** Lines such as "Cash Flows: 2 added, 1 changed" for changes the field table does not show. */
  summary?: string[];
  onConfirm: () => void; onBack: () => void;
}) {
  const changed = changedFields(fields, before, after);
  const [unit, setUnit] = useState(DEFAULT_UNITS[0]);
  const text = (d: AnyField, row: Row) => typeOf(d) === 'amount' ? formatAmount(amountInUnit(row[d.field] ?? '', unit, d.scale)) : formatField(d, row, lk);
  const nothing = !changed.length && !summary.length;
  return (
    <Modal title={title} wide onClose={onBack} busy={busy} onPrimary={nothing ? undefined : onConfirm} footer={<>
      <button className="button secondary" disabled={busy} onClick={onBack}>Back</button>
      <button className="button" disabled={busy || nothing} onClick={onConfirm}>{busy ? 'Saving…' : confirmLabel}</button>
    </>}>
      <WizardSteps steps={['Edit details', 'Review changes', 'Save']} current={busy ? 2 : 1} />
      <DialogSection title="Change summary" description="Review the current and proposed values before saving.">
      {changed.some(d => typeOf(d) === 'amount') && <div className="kit-amount-toolbar"><span>Amounts in</span><AmountUnitPicker label="Review amounts" unit={unit} onChange={setUnit} /></div>}
      {changed.length > 0 && <div className="ds-grid-wrap"><DataTable columns={[{ kind: 'text' }, { align: 'right' }, { align: 'right' }]} className="ds-table">
        <thead><tr><th>Field</th><th>Current</th><th>New</th></tr></thead>
        <tbody>{changed.map(d => {
          const right = behaviourOf(d).align === 'right' ? { textAlign: 'right' as const } : undefined;
          return <tr key={d.field}><td>{labelOf(d)}</td><td style={right}>{text(d, before)}</td><td style={right}><b>{text(d, after)}</b></td></tr>;
        })}</tbody>
      </DataTable></div>}
      {summary.length > 0 && <ul className="kit-summary">{summary.map(s => <li key={s}>{s}</li>)}</ul>}
      {nothing && <p className="td-muted">Nothing has changed.</p>}
      </DialogSection>
    </Modal>
  );
}
