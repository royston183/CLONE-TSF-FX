import { Check } from 'lucide-react';

/** Progress describes real workflow stages; validation and navigation remain with the owning dialog. */
export function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="kit-wizard" aria-label="Progress">{steps.map((label, i) => <li key={label} className={i < current ? 'complete' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
    <span>{i < current ? <Check size={14} /> : i + 1}</span><b>{label}</b>
  </li>)}</ol>;
}
