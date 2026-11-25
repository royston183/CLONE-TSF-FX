export type StatusTone = 'open' | 'pending' | 'done' | 'neutral'

/**
 * Tone is derived from the status text because SAP hands back a description, not a tone.
 * Exported so a caller with a real status code can pass the tone directly instead.
 */
export function statusTone(text: string): StatusTone {
  if (/open/i.test(text)) return 'open'
  if (/pend/i.test(text)) return 'pending'
  if (/assign|complete|clos/i.test(text)) return 'done'
  return 'neutral'
}

/* The tone repeats in an icon, so the meaning survives for anyone who cannot tell the colours
   apart: ✓ open, ◷ pending, i done, – neutral (lucide's glyphs, drawn inline). */
const ICONS: Record<StatusTone, string[]> = {
  open: ['M21.801 10A10 10 0 1 1 17 3.335', 'm9 11 3 3L22 4'],
  pending: ['M12 6v6l4 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
  done: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 16v-4', 'M12 8h.01'],
  neutral: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M8 12h8'],
}

export function StatusPill({ status, tone }: { status: string | undefined; tone?: StatusTone }) {
  const text = status?.trim() || 'Draft'
  const resolved = tone ?? statusTone(text)
  return (
    <span className={`slc-pill slc-pill--${resolved}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[resolved].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {text}
    </span>
  )
}
