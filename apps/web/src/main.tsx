import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter is the face the whole product is designed in: the generated menu-path.css asks for
// it on every hub element, and tokens.css names it first in --font. Until this import it
// was never actually loaded, so every screen silently fell back to a system sans.
import '@fontsource-variable/inter'
import { App } from './App.tsx'
import { applyTheme, initialTheme } from './shared/theme.ts'

// Before the first render rather than in an effect: an effect runs after the browser has
// already painted, so a night-mode user would see one white frame on every cold load.
applyTheme(initialTheme())

const container = document.getElementById('root')
if (!container) throw new Error('index.html is missing <div id="root">.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
