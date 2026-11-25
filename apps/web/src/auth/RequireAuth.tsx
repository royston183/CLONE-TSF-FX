import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Splash } from '@slc/ui'
import { useAuth } from './AuthContext.tsx'

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()

  // Render nothing decisive until the session check finishes, or a reload would flash the
  // login page at an already-signed-in user before bouncing them back.
  if (auth.status === 'checking') {
    return <Splash step="Checking your session…" />
  }

  // The check itself failed: say so on the same screen, with a way to try again.
  if (auth.status === 'error') {
    return <Splash error={auth.error} onRetry={auth.retry} />
  }

  if (auth.status === 'anonymous') {
    // Sign-in always lands on Overview, so there is nothing to remember about where they were headed.
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
