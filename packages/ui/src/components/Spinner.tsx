/** The LAS four-dot loader (red · yellow · green · grey), pulsing in turn. */
export function Loader({ label, large = false }: { label?: string; large?: boolean }) {
  return (
    <span
      className={`slc-loader${large ? ' is-lg' : ''}`}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="slc-spinner" role="status" aria-live="polite">
      <Loader large />
      <span className="slc-visually-hidden">{label}</span>
    </span>
  )
}
