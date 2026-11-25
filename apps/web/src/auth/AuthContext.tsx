import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, apiFetch } from '@slc/api-client'

export type User = { username: string; displayName: string }

type AuthState =
  | { status: 'checking'; user: undefined }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: undefined }
  /** The session check itself failed (gateway down, network), as opposed to "not signed in". */
  | { status: 'error'; user: undefined; error: string }

type AuthApi = AuthState & {
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Runs the session check again, after an `error`. */
  retry: () => void
}

const AuthContext = createContext<AuthApi | undefined>(undefined)

export function useAuth(): AuthApi {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>.')
  return auth
}

/**
 * Holds who is signed in. The session itself lives in an httpOnly cookie the gateway sets,
 * so no token is ever readable from JavaScript and a page reload re-establishes state from
 * GET /auth/me rather than from anything stored in the browser.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking', user: undefined })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ user: User }>('/auth/me')
      .then((data) => {
        if (!cancelled) setState({ status: 'authenticated', user: data.user })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // A 401 is the normal "not signed in yet" case, not an error worth surfacing. Anything
        // else (no answer, a 5xx) means the check never completed, and the loading screen says so.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          setState({ status: 'anonymous', user: undefined })
        } else {
          setState({
            status: 'error',
            user: undefined,
            error: 'Could not reach the TSF gateway. Check that it is running, then retry.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'checking', user: undefined })
    setAttempt((n) => n + 1)
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    try {
      const data = await apiFetch<{ user: User }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      setState({ status: 'authenticated', user: data.user })
    } catch (error) {
      setState({ status: 'anonymous', user: undefined })
      throw error instanceof ApiError ? error : new Error('Sign-in failed.')
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } finally {
      // Whatever the gateway said, stop treating this browser as signed in.
      setState({ status: 'anonymous', user: undefined })
    }
  }, [])

  const value = useMemo<AuthApi>(
    () => ({ ...state, signIn, signOut, retry }),
    [state, signIn, signOut, retry],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
