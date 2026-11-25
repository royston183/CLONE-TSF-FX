/**
 * A flat empty-state picture: a sheet of lines with a magnifier, and the four logo-coloured
 * dots that twinkle in turn. Painted only from the --illo-* and --status-* tokens, so the dark
 * theme repaints it. Decorative (aria-hidden): the words beside it carry the meaning.
 */
export function Illustration({ size = 96 }: { size?: number }) {
  return (
    <svg
      className="slc-illo"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
    >
      <ellipse className="slc-illo__paper" cx="48" cy="84" rx="30" ry="5" />
      <rect className="slc-illo__sheet" x="22" y="12" width="46" height="62" rx="6" />
      <rect className="slc-illo__line" x="30" y="24" width="30" height="4" rx="2" />
      <rect className="slc-illo__line" x="30" y="34" width="22" height="4" rx="2" />
      <rect className="slc-illo__line" x="30" y="44" width="26" height="4" rx="2" />
      <circle className="slc-illo__lens" cx="62" cy="58" r="13" />
      <path className="slc-illo__handle" d="m71 67 10 10" strokeWidth="5" strokeLinecap="round" />
      <circle className="slc-illo__dot slc-illo__dot--y" cx="16" cy="30" r="3" />
      <circle className="slc-illo__dot slc-illo__dot--r" cx="80" cy="22" r="3" />
      <circle className="slc-illo__dot slc-illo__dot--g" cx="14" cy="62" r="2.5" />
      <circle className="slc-illo__dot slc-illo__dot--n" cx="84" cy="46" r="2.5" />
    </svg>
  )
}
