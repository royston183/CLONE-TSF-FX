import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { StatusOption } from './invoice.ts'
import { workflowProgress } from './workflow-progress.ts'

/**
 * The Deal ID's workflow status as a badge that opens a read-only list of the whole workflow: what is completed, where the Deal ID
 * is now and what is still ahead. Viewing only: no status can be chosen or changed here, and no call is made.
 */
export function WorkflowStatus({ status, label, options }: { status: string; label: string; options: readonly StatusOption[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const stages = workflowProgress(options, status)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <span className="wf-status" ref={box}>
      <button ref={button} type="button" className="inv-hero__status wf-status__badge" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} title="Show the workflow progress" onClick={() => setOpen((o) => !o)}>
        <span>{label}</span><ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="wf-status__panel" role="dialog" aria-label="Workflow status progress">
          <div className="wf-status__head">Workflow progress <small>view only</small></div>
          {stages.length ? (
            <ol className="wf-status__list">
              {stages.map((s) => (
                <li key={s.code} className={`wf-status__row wf-status__row--${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
                  <span className="wf-status__mark" aria-hidden="true">{s.state === 'completed' ? <Check size={12} /> : null}</span>
                  <span className="wf-status__code">{s.code}</span>
                  <span className="wf-status__text">{s.text}</span>
                  <span className="wf-status__state">{s.state === 'completed' ? 'Completed' : s.state === 'current' ? 'Current' : 'Upcoming'}</span>
                </li>
              ))}
            </ol>
          ) : <p className="wf-status__empty">The status list could not be read.</p>}
          <p className="wf-status__note">Stages follow the status master, ordered by code. Some later stages are alternatives to each other or exceptional (for example a cancellation), so not every upcoming stage will be reached.</p>
        </div>
      )}
    </span>
  )
}
