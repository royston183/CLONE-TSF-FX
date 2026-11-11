import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { OpenMode } from '@tsfx/modules/types';
import { FootActions, Modal, modalStack, RecordHeading, useSaveShortcut } from './Modal';
import { Tabs } from './Tabs';
import { WizardSteps } from './WizardSteps';

export interface ObjectDialogTab { id: string; label: string; content: ReactNode; empty?: boolean; bad?: boolean }
export interface ObjectFact { label: string; value: ReactNode; num?: boolean }
/** Where a wizard is: a footer that depends on it is given this. */
export interface WizardPosition { last: boolean }

/** A value as a record shows it: the text, or a muted "—" when it is empty. */
export function DisplayValue({ children }: { children: ReactNode }) {
  return children === '' || children === null || children === undefined ? <span className="kit-empty">—</span> : <>{children}</>;
}

/**
 * The wizard's steps: the header form first (labelled Details, never skipped), then one step per tab. `skip` leaves a
 * step out (by id: `head` or the tab id).
 */
export function wizardStepsOf(tabs: ObjectDialogTab[], head: ReactNode, skip?: (stepId: string) => boolean): ObjectDialogTab[] {
  return [{ id: 'head', label: 'Details', content: head }, ...tabs].filter((s, i) => i === 0 || !skip?.(s.id));
}

/** The index of the selected step (the first when `tab` is none of them). */
const indexOf = (steps: ObjectDialogTab[], tab: string): number => Math.max(0, steps.findIndex(t => t.id === tab));
/** True while no dialog is open: an inline record answers Ctrl+S only then. */
const noDialogOpen = () => modalStack.size() === 0;

interface FrameProps {
  frame: OpenMode; eyebrow: string; title: string; status?: ReactNode; subtitle?: string; facts: ObjectFact[]; head?: ReactNode; notice?: ReactNode;
  /** The tabs (pop-up, page) or the steps (wizard: Details first, skipped ones already left out). */
  steps: ObjectDialogTab[];
  footer: ReactNode; footerStart?: ReactNode; onClose: () => void; onPrimary?: () => void; busy?: boolean;
  /** The selected tab (wizard: step) id and its setter. */
  tab: string; onTab: (id: string) => void;
}

/** The facts, notice and tabs of a record (or the wizard's steps): the same in every frame. */
function RecordBody({ frame, eyebrow, facts, head, notice, steps, tab, onTab }: Pick<FrameProps, 'frame' | 'eyebrow' | 'facts' | 'head' | 'notice' | 'steps' | 'tab' | 'onTab'>) {
  const wizard = frame === 'wizard';
  const at = indexOf(steps, tab);
  const current = steps[at];
  return (
    <>
      {facts.length > 0 && <dl className="kit-facts">{facts.map(f => (
        <div key={f.label}><dt>{f.label}</dt><dd className={f.num ? 'kit-num' : undefined}><DisplayValue>{f.value}</DisplayValue></dd></div>
      ))}</dl>}
      {wizard && <WizardSteps steps={steps.map(s => s.label)} current={at} />}
      {notice && <div className="kit-record-notice">{notice}</div>}
      {wizard ? (
        <div className="kit-record-panel">
          {current?.content}
          <div className="kit-wizard-nav">
            {at > 0 && <button type="button" className="button secondary" onClick={() => onTab(steps[at - 1].id)}>Back</button>}
            {at < steps.length - 1 && <button type="button" className="button" onClick={() => onTab(steps[at + 1].id)}>Next</button>}
          </div>
        </div>
      ) : steps.length > 0 && (
        <Tabs label={`${eyebrow} details`} current={current.id} onSelect={onTab} panelClassName="kit-record-panel"
          tabs={steps.map(t => ({ id: t.id, label: t.label, className: [t.empty ? 'kit-tab-empty' : '', t.bad ? 'kit-tab-bad' : ''].filter(Boolean).join(' ') || undefined }))}>
          {at === 0 && head && <div className="kit-record-head">{head}</div>}
          {current.content}
        </Tabs>
      )}
    </>
  );
}

/** One record in its frame: a pop-up (Modal), or inline as a page or a wizard (the same header, facts, notice and footer). */
export function ObjectFrame({ frame, ...p }: FrameProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const { onPrimary, busy } = p;
  useSaveShortcut(frame === 'popup' ? undefined : onPrimary, busy, noDialogOpen);
  // A page or wizard takes the list's place: bring its heading into view and focus it (the pop-up's Modal does this itself).
  useEffect(() => {
    if (frame === 'popup') return;
    heading.current?.focus();
    heading.current?.scrollIntoView?.();
  }, [frame]);
  const body = <RecordBody frame={frame} eyebrow={p.eyebrow} facts={p.facts} head={p.head} notice={p.notice} steps={p.steps} tab={p.tab} onTab={p.onTab} />;
  if (frame === 'popup') {
    return <Modal variant="record" eyebrow={p.eyebrow} title={p.title} status={p.status} subtitle={p.subtitle} onClose={p.onClose} busy={busy} onPrimary={onPrimary} footer={p.footer} footerStart={p.footerStart}>{body}</Modal>;
  }
  return (
    <section className={`kit-record-page${frame === 'wizard' ? ' kit-record-wizard' : ''}`} aria-labelledby={titleId} aria-busy={busy}>
      <header className="kit-record-page-head">
        <RecordHeading eyebrow={p.eyebrow} title={p.title} status={p.status} subtitle={p.subtitle} titleId={titleId} titleRef={heading} />
      </header>
      <div className="kit-record-page-body">{body}</div>
      <FootActions className="kit-record-page-foot" footerStart={p.footerStart} footer={p.footer} />
    </section>
  );
}

/**
 * One business record (ModalDisplay / ModalEdit design): a compact header (eyebrow, key, status tag, subtitle),
 * the key facts of its header fields, one tab strip, and per tab its grouped fields or tables; every action in the
 * footer. `frame` picks a pop-up (default), a page in place of the list, or a wizard (the header form, then a step per
 * tab). In edit mode `head` (the header fields as a form) opens the first tab and there are no facts. The selected
 * tab starts at the first one, and again whenever the frame changes (the caller keys it by frame).
 */
export function ObjectDialog({ frame = 'popup', skip, facts = [], footer, tabs, onPrimary, ...rest }: {
  frame?: OpenMode;
  eyebrow: string; title: string; status?: ReactNode; subtitle?: string; facts?: ObjectFact[];
  /** The header fields as a form (edit and create): shown at the top of the first tab (wizard: its own first step). */
  head?: ReactNode;
  /** Shown above the tabs (save problems, conflicts). */
  notice?: ReactNode;
  /** `footer`: Close, Cancel and the primary action (right); `footerStart`: Delete and the object's other actions (left). A function is given whether the wizard is on its last step. */
  tabs: ObjectDialogTab[]; footer: ReactNode | ((at: WizardPosition) => ReactNode); footerStart?: ReactNode; onClose: () => void; onPrimary?: () => void; busy?: boolean;
  /** Wizard only: true leaves that step (`head` or a tab id) out. */
  skip?: (stepId: string) => boolean;
}) {
  const wizard = frame === 'wizard';
  const [tab, setTab] = useState(wizard ? 'head' : tabs[0]?.id ?? '');
  const steps = wizard ? wizardStepsOf(tabs, rest.head, skip) : tabs;
  const last = indexOf(steps, tab) === steps.length - 1;
  // Ctrl+S saves a wizard only from its last step, where Save shows.
  return <ObjectFrame frame={frame} facts={facts} steps={steps} tab={tab} onTab={setTab} onPrimary={wizard && !last ? undefined : onPrimary}
    footer={typeof footer === 'function' ? footer({ last }) : footer} {...rest} />;
}
