import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { checkFields, valueFields, behaviourOf, type AnyField } from '@tsfx/lib/fields';
import type { Row } from '@tsfx/lib/grid/types';
import { FieldControl } from '@tsfx/components/fields/FieldControl';
import { FormGrid } from '@tsfx/components/fields/FormGrid';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { ValueHelpDialog } from './ValueHelpDialog';
import { DialogSection } from './DialogSection';

/** Create or edit one record. Problems show once a field was touched or Save was tried; server errors show on their field. */
export function FormDialog({ title, subtitle, fields, initial, lk, columns = 1, check, serverErrors = {}, serverMessage, busy = false, saveLabel = 'Save', section, onSave, onClose }: {
  title: string; subtitle?: string; fields: AnyField[]; initial: Row; lk: unknown; columns?: 1 | 2;
  /** The fields' section heading (default "Record details" and how to fill them in). */
  section?: { title: string; description?: string };
  check?: (row: Row) => Record<string, string>; serverErrors?: Record<string, string>; serverMessage?: string;
  busy?: boolean; saveLabel?: string; onSave: (row: Row) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Row>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [savedDraft, setSavedDraft] = useState<Row | null>(null);
  const [help, setHelp] = useState<AnyField | null>(null);
  const clean = useMemo(() => Object.fromEntries(valueFields(fields).map(d => [d.field, behaviourOf(d).clean(draft[d.field] ?? '', d)])), [fields, draft]);
  const problems = useMemo(() => {
    const base = checkFields(fields, clean, lk);
    const extra = check ? check(clean) : {};
    return Object.fromEntries(Object.keys({ ...base, ...extra }).map(f => [f, extra[f] || base[f] || '']));
  }, [fields, clean, lk, check]);
  const invalid = Object.values(problems).some(Boolean);
  const serverError = (f: string) => (!savedDraft || (draft[f] ?? '') === (savedDraft[f] ?? '') ? serverErrors[f] : '');
  const shown = (f: string) => serverError(f) || ((tried || touched.has(f)) ? problems[f] : '') || '';
  const errorText = (f: string) => { const p = shown(f); return p === 'required' ? `${fields.find(d => d.field === f)?.label.replace(/\s*\*$/, '') ?? f} is required.` : p; };
  const save = () => { setTried(true); setSavedDraft(draft); if (!invalid && !busy) onSave(clean); };
  const setField = (field: string, value: string) => { setDraft(r => ({ ...r, [field]: value })); setTouched(t => new Set(t).add(field)); };
  return (
    <Modal title={title} subtitle={subtitle} wide={columns === 2} onClose={onClose} busy={busy} onPrimary={save} footer={<>
      <span className={`ds-foot-hint ${tried && invalid ? 'bad' : ''}`}>{tried && invalid ? 'Fix the highlighted fields to save' : 'Ctrl+S saves'}</span>
      <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : saveLabel}</button>
    </>}>
      {serverMessage && <Notice error><AlertCircle size={16} />{serverMessage}</Notice>}
      <DialogSection title={section?.title ?? 'Record details'} description={section ? section.description : 'Complete the fields below. Fields marked * are required.'}>
      <FormGrid columns={columns}>
        {fields.map(d => (
          <FieldControl key={d.field} def={d} variant="form" row={draft} lk={lk} error={errorText(d.field) || errorText(d.toField ?? '') || undefined}
            disabled={busy} onChange={setField} onValueHelp={d.valueHelp ? () => setHelp(d) : undefined} />
        ))}
      </FormGrid>
      </DialogSection>
      {help?.lookup && <ValueHelpDialog title={`Select ${help.label.replace(/\s*\*$/, '')}`} items={help.lookup(lk, draft)} onClose={() => setHelp(null)}
        onPick={code => { setField(help.field, code); setHelp(null); }} />}
    </Modal>
  );
}
