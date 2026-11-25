import { Moon, Sun } from 'lucide-react'
import type { Theme } from '../shared/theme.ts'

/**
 * Day / night switch in the top bar: a 36×36 icon button. The icon shows what you GET by
 * pressing it (a moon while it is day), its tooltip says the same in words, and
 * aria-pressed reports whether night is on.
 */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const goingDark = theme === 'light'
  return (
    <button
      type="button"
      className="slc-icon-btn mp-theme-toggle"
      onClick={onToggle}
      aria-pressed={theme === 'dark'}
      aria-label={goingDark ? 'Night' : 'Day'}
      title={goingDark ? 'Switch to night mode' : 'Switch to day mode'}
    >
      {goingDark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
    </button>
  )
}
