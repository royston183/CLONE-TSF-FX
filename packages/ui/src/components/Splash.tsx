import { FS_LOGO } from './AppShell.tsx'
import { Button } from './Button.tsx'
import { Loader } from './Spinner.tsx'

export type SplashProps = {
  title?: string
  /** What is being waited on, e.g. "Checking your session…". */
  step?: string
  /** When set the ring stops and the error is shown, with an optional Retry. */
  error?: string
  onRetry?: () => void
}

/**
 * The full-screen loading state: the Fourth Signal mark inside a ring that turns in the
 * logo's four colours, the step being waited on, and an indeterminate bar. With `error` the
 * ring stops and greys out and `onRetry` offers another try.
 */
export function Splash({ title = 'TSF', step = 'Loading…', error, onRetry }: SplashProps) {
  return (
    <main className={`slc-splash${error ? ' slc-splash--failed' : ''}`} aria-busy={!error}>
      <div className="slc-splash__card">
        <div className="slc-splash__mark">
          <span className="slc-splash__ring" aria-hidden="true" />
          <img src={FS_LOGO} alt="" />
        </div>
        <strong className="slc-splash__title">{title}</strong>
        {error ? (
          <>
            <p className="slc-splash__step slc-splash__step--error" role="alert">
              {error}
            </p>
            {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
          </>
        ) : (
          <>
            <p className="slc-splash__step">
              <Loader label={step} /> {step}
            </p>
            <span className="slc-splash__bar" aria-hidden="true">
              <i />
            </span>
          </>
        )}
      </div>
    </main>
  )
}
