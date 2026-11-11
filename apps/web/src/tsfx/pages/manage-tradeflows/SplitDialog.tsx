// Split a BL (or add BLs from the trade flow's open quantity) in two numbered steps: how many BLs, then their
// quantities (an equal split, each editable) with a live total, what is left, and each BL's value.
import { useState } from 'react';
import { Modal } from '@tsfx/components/ui/Modal';
import { DataTable } from '@tsfx/components/table/DataTable';
import { Notice } from '@tsfx/components/ui/Notice';
import { WizardSteps } from '@tsfx/components/ui/WizardSteps';
import { formatAmount4 } from '@tsfx/lib/fields/parse';
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import { equalSplit } from '@tsfx/modules/tradeflow-manage/split';
import { fmtQty, splitSummary } from './logic';

const STEPS = ['How many BLs', 'Quantities'];

export function SplitDialog({ tf, source, open, busy, onClose, onSave }: {
  tf: Row; source: Row | null; open: string; busy: boolean; onClose: () => void; onSave: (quantities: string[]) => void;
}) {
  const min = source ? 2 : 1;
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(String(min));
  const [quantities, setQuantities] = useState<string[]>([]);
  const n = Number(count);
  const countOk = Number.isInteger(n) && n >= min && n <= 50;
  const limit = source ? str(source.quantity) : open;
  const summary = splitSummary(source, open, quantities, str(tf.price));
  const unit = str(tf.unit), cur = str(tf.currency) || 'USD';
  const title = source ? `Split BL ${str(source.blNo)}` : 'Add BLs';
  const next = () => { if (!countOk) return; setQuantities(equalSplit(limit, n)); setStep(1); };
  const save = () => { if (!summary.problems.length && !busy) onSave(quantities); };

  return (
    <Modal title={title} subtitle={`Trade flow ${str(tf.tfNo)} · ${fmtQty(limit)} ${unit} available`} busy={busy} onClose={onClose}
      onEnter={step === 0 ? next : save}
      footer={<>
        {step === 1 && <button className="button secondary" disabled={busy} onClick={() => setStep(0)}>Back</button>}
        <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        {step === 0
          ? <button className="button" disabled={!countOk} onClick={next}>Next</button>
          : <button className="button" disabled={busy || summary.problems.length > 0} onClick={save}>{busy ? 'Saving…' : `Save ${quantities.length} BLs`}</button>}
      </>}>
      <div className="tsf-split">
        <WizardSteps steps={STEPS} current={step} />
        {step === 0 && (
          <section className="tsf-split__section">
            <h3>How many BLs</h3>
            <p className="tsf-split__hint">{source
              ? `BL ${str(source.blNo)} (${fmtQty(limit)} ${unit}) is replaced by this many BLs; it stays in the list, flagged as deleted.`
              : `New BLs share the open ${fmtQty(limit)} ${unit} of the trade flow.`}</p>
            <label className="tsf-split__count">
              <span>Number of BLs</span>
              <input className="input" type="number" min={min} max={50} step={1} value={count} aria-label="Number of BLs"
                onChange={e => setCount(e.target.value)} />
            </label>
            {!countOk && <p className="tsf-split__error" role="alert">Enter a whole number from {min} to 50.</p>}
          </section>
        )}
        {step === 1 && (
          <section className="tsf-split__section">
            <h3>Quantities</h3>
            <p className="tsf-split__hint">An equal split to start with; change any quantity. The BLs may add up to less than {fmtQty(limit)} {unit}, never more.</p>
            <DataTable className="tsf-split__table" nativeLayout nativeExport aria-label="New BLs">
              <thead><tr><th>New BL</th><th className="num">Quantity ({unit})</th><th className="num">Value ({cur})</th></tr></thead>
              <tbody>{quantities.map((q, i) => (
                <tr key={i}>
                  <td>BL {i + 1}</td>
                  <td className="num"><input className="input num" inputMode="decimal" aria-label={`Quantity of BL ${i + 1}`} value={q}
                    onChange={e => setQuantities(list => list.map((v, j) => (j === i ? e.target.value : v)))} /></td>
                  <td className="num">{summary.values[i] ? formatAmount4(summary.values[i]) : 'No price'}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><th>Total</th><th className="num">{fmtQty(summary.total)}</th><th /></tr></tfoot>
            </DataTable>
            <dl className="tsf-split__facts">
              <div><dt>Available</dt><dd>{fmtQty(summary.limit)} {unit}</dd></div>
              <div><dt>Left open</dt><dd className={summary.left.startsWith('-') ? 'bad' : ''}>{fmtQty(summary.left)} {unit}</dd></div>
            </dl>
            {summary.problems.map(p => <Notice key={p} error>{p}</Notice>)}
          </section>
        )}
      </div>
    </Modal>
  );
}
