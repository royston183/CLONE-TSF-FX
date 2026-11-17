import './mc-status-colors.css'

/**
 * Master Contract status colours, the same on every screen: Created red, In Use yellow, Released to MO green.
 * Each screen names its status classes differently, so the badge is recognised by its text and tagged
 * with data-mcs; mc-status-colors.css does the colouring.
 */
const SELECTOR = '.status-text, .status-pill, .status-cell'

function kindOf(text: string): string | null {
  const t = text.toLowerCase().replace(/[.\s]/g, '')
  if (t === 'created') return 'created'
  if (t === 'inuse') return 'inuse'
  if (t === 'releasedtomo' || t === 'releasetomo') return 'released'
  return null
}

function tag(el: Element): void {
  const kind = kindOf(el.textContent ?? '')
  if (kind) {
    if (el.getAttribute('data-mcs') !== kind) el.setAttribute('data-mcs', kind)
  } else if (el.hasAttribute('data-mcs')) el.removeAttribute('data-mcs')
}

function scan(root: ParentNode): void {
  if (root instanceof Element && root.matches(SELECTOR)) tag(root)
  root.querySelectorAll(SELECTOR).forEach(tag)
}

export function installMcStatusColors(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  scan(document)
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') {
        const el = r.target.parentElement?.closest(SELECTOR)
        if (el) tag(el)
      } else r.addedNodes.forEach((n) => { if (n instanceof Element) scan(n); else if (n.parentElement) { const el = n.parentElement.closest(SELECTOR); if (el) tag(el) } })
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true })
}
