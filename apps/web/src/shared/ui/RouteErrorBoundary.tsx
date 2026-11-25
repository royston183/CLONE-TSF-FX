import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Splash } from '@slc/ui'

type Props = { children: ReactNode; title?: string }
type State = { error?: Error }

/**
 * Catches a screen that fails to load (a lazy chunk that 404s after a deploy, a render
 * crash) and shows it on the loading screen — the Fourth Signal mark with the ring stopped,
 * the reason, and Retry — instead of a blank page.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen failed to load', error, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <Splash
        {...(this.props.title ? { title: this.props.title } : {})}
        error={`This screen could not be loaded. ${this.state.error.message}`}
        onRetry={() => window.location.reload()}
      />
    )
  }
}
