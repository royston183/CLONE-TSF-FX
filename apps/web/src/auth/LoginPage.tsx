import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { FS_LOGO, Loader, Splash } from '@slc/ui'
import { useAuth } from './AuthContext.tsx'
import './login.css'

/**
 * Where trade structured finance sits along Olam Agri's physical chain.
 *
 * The four stages are Olam Agri's own value chain as it describes it — "global origination,
 * processing, trading, logistics, distribution" (olamagri.com) — and each detail line is the
 * financing instrument that funds that leg. This is the business the application serves, so
 * it is what the sign-in screen shows; it is deliberately not a tour of the screens inside.
 */
const CHAIN = [
  { no: '01', stage: 'Originate', detail: 'Pre-export finance' },
  { no: '02', stage: 'Process', detail: 'Inventory finance' },
  { no: '03', stage: 'Ship', detail: 'Documentary credits' },
  { no: '04', stage: 'Distribute', detail: 'Receivables discounting' },
]

/**
 * Olam Agri calls itself a food, feed and fibre agri-business; these are its product
 * platforms from olamagri.com/products-services, grouped under those three words.
 */
const PLATFORMS = [
  { group: 'Food', items: ['Grains & Oilseeds', 'Rice', 'Edible Oils', 'Wheat Milling & Pasta'] },
  { group: 'Feed', items: ['Animal Feed & Protein', 'Specialty Grains & Seeds'] },
  { group: 'Fibre', items: ['Cotton', 'Wood Products', 'Rubber'] },
]

/** Scale, as Olam Agri publishes it on olamagri.com. */
const STATS = [
  { figure: '30+', label: 'Countries' },
  { figure: '9,300', label: 'Customers' },
  { figure: '70', label: 'Processing facilities' },
]

/** No I/O/0/1 — they are indistinguishable in a distorted glyph and only cause retypes. */
const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CAPTCHA_LENGTH = 5

function makeCaptcha() {
  const bytes = new Uint32Array(CAPTCHA_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CAPTCHA_ALPHABET[b % CAPTCHA_ALPHABET.length]).join('')
}

/** Per-character tilt, so the rendered code is not a clean horizontal baseline. */
function charSkew(index: number, code: string) {
  const seed = code.charCodeAt(index) + index * 7
  return {
    transform: `rotate(${(seed % 17) - 8}deg) translateY(${(seed % 5) - 2}px)`,
  }
}

/** Every sign-in opens the hub on Overview, whatever route first sent the user here. */
const LANDING = '/overview'

export function LoginPage() {
  const auth = useAuth()
  const { status, signIn } = auth
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [captcha, setCaptcha] = useState(makeCaptcha)
  const [captchaInput, setCaptchaInput] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  function newCaptcha() {
    setCaptcha(makeCaptcha())
    setCaptchaInput('')
  }

  if (status === 'checking') return <Splash step="Checking your session…" />
  if (auth.status === 'error') return <Splash error={auth.error} onRetry={auth.retry} />
  if (status === 'authenticated') return <Navigate to={LANDING} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(undefined)

    // Checked before the credential call, so a wrong code costs no round trip.
    if (captchaInput.trim().toUpperCase() !== captcha) {
      setError('Security code does not match. Please try again.')
      newCaptcha()
      return
    }

    setBusy(true)
    try {
      await signIn(username, password)
      navigate(LANDING, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
      // A fresh code per attempt — otherwise one solve covers unlimited guesses.
      newCaptcha()
    } finally {
      setBusy(false)
    }
  }

  // The gateway authenticates one shared credential; no OAuth client is configured.
  function onGoogle() {
    setError('Google sign-in is not configured. Use your TSF username and password.')
  }

  return (
    <div className="login">
      <section className="login__pitch">
        <div className="login__brand">
          <img src={FS_LOGO} alt="" className="login__mark" />
          <div>
            <h1 className="login__brandName">TSF</h1>
            <p className="login__brandTag">Olam Agri &bull; Trade Structured Finance</p>
          </div>
        </div>

        <div className="login__pitchBody">
          <h2 className="login__headline">Structured finance for food, feed and fibre.</h2>
          <p className="login__sub">
            Grains, rice, edible oils and cotton moving from farm-gate to destination market
            across 30+ countries — and the facilities that fund every leg of that journey.
          </p>

          <ul className="login__stats">
            {STATS.map((stat) => (
              <li className="login__stat" key={stat.label}>
                <span className="login__statFigure">{stat.figure}</span>
                <span className="login__statLabel">{stat.label}</span>
              </li>
            ))}
          </ul>

          <div className="login__flow">
            <p className="login__flowTitle">Finance across the chain</p>
            <ol className="login__flowSteps">
              {CHAIN.map((step) => (
                <li className="login__stage" key={step.no}>
                  <span className="login__stageDot" aria-hidden="true" />
                  <span className="login__stageNo">{step.no}</span>
                  <span className="login__stageName">{step.stage}</span>
                  <span className="login__stageDetail">{step.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="login__desks">
            {PLATFORMS.map((row) => (
              <div className="login__desk" key={row.group}>
                <span className="login__deskName">{row.group}</span>
                <div className="login__deskItems">
                  {row.items.map((item) => (
                    <span className="login__chip" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login__panel">
        <form className="login__card" onSubmit={onSubmit} noValidate>
          <h2 className="login__welcome">Welcome Back</h2>
          <p className="login__intro">Login to continue to TSF</p>
          <span className="login__rule" aria-hidden="true" />

          <div className="login__field">
            <label className="login__label" htmlFor="login-email">
              Email
            </label>
            <div className="login__control">
              <UserIcon />
              {/* Deliberately type="text": the gateway checks a username (`demo`), not an
                  address, so type="email" would reject the credential that actually works. */}
              <input
                id="login-email"
                name="username"
                type="text"
                className="login__input"
                placeholder="Enter your email"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="login__field">
            <label className="login__label" htmlFor="login-password">
              Password
            </label>
            <div className="login__control">
              <LockIcon />
              <input
                id="login-password"
                name="password"
                type={revealed ? 'text' : 'password'}
                className="login__input"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login__reveal"
                onClick={() => setRevealed((on) => !on)}
                aria-label={revealed ? 'Hide password' : 'Show password'}
                aria-pressed={revealed}
              >
                <EyeIcon off={revealed} />
              </button>
            </div>
          </div>

          <div className="login__field">
            <label className="login__label" htmlFor="login-captcha">
              Security Code
            </label>
            <div className="login__captcha">
              {/* The code is text, not an image, so it stays legible when zoomed. It is
                  aria-hidden and paired with the visually-hidden hint below, which carries
                  the characters spaced out for screen readers. */}
              <div className="login__captchaCode" aria-hidden="true">
                <span className="login__captchaNoise" />
                {captcha.split('').map((ch, i) => (
                  <span className="login__captchaChar" key={i} style={charSkew(i, captcha)}>
                    {ch}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="login__captchaRefresh"
                onClick={newCaptcha}
                aria-label="Get a new security code"
              >
                <RefreshIcon />
              </button>
              <div className="login__control login__control--captcha">
                <input
                  id="login-captcha"
                  name="captcha"
                  type="text"
                  className="login__input"
                  placeholder="Enter code"
                  value={captchaInput}
                  onChange={(event) => setCaptchaInput(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={CAPTCHA_LENGTH}
                  aria-describedby="login-captcha-text"
                  required
                />
              </div>
            </div>
            <p className="login__srOnly" id="login-captcha-text">
              Security code: {captcha.split('').join(' ')}
            </p>
          </div>

          {/* role="alert" so the failure is announced, not just shown. */}
          {error ? (
            <p className="login__error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login__submit" disabled={busy} aria-busy={busy || undefined}>
            {busy ? (
              <Loader />
            ) : (
              <>
                Login <ArrowIcon />
              </>
            )}
          </button>

          <div className="login__or">
            <span>OR</span>
          </div>

          <button type="button" className="login__google" onClick={onGoogle}>
            <GoogleIcon />
            Sign in with Google
          </button>

          <p className="login__note">
            <ShieldIcon />
            Internal TSF access only
          </p>
        </form>
      </section>
    </div>
  )
}

/* Inline SVGs: the login page is the one screen that must render before any asset loads. */

function UserIcon() {
  return (
    <svg className="login__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="login__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg className="login__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 20 20 4" /> : null}
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="login__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg className="login__arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="login__noteIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.2-2.9 8.1-7 9.5-4.1-1.4-7-5.3-7-9.5V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="login__googleIcon" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
