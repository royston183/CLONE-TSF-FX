// Icons for the buttons of every application screen without touching 60 screens' markup. A button is given a
// `data-ico` attribute from its label (Save, Back, Add, Delete…), and a stylesheet drawn from the lucide icons paints
// that icon before the label with CSS (a mask, so it takes the button's own text colour). The attribute is one React
// never manages, so a re-render of the label leaves it alone.
//
// A button that already had an icon of its own (a hand-drawn SVG, an image, an icon span, a symbol character such as
// ✓ ↻ ⚠ + in its label, or an icon drawn by CSS) would show two. The old one is taken out of sight and the new one kept:
// elements are hidden with an attribute (never removed, so React's own tree stays intact), and a symbol character is
// trimmed off the front of the label text. Icons the Trade Flows screens draw with lucide in their own code are the new
// icons already, so those buttons are left alone.
import { createElement, type ComponentType } from 'react'
import { sweepKeyColumns } from './keyColumns.ts'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ArrowLeft, ArrowRight, Calculator, Check, Copy, Download, Eye, FileText, Filter, Link2, LogOut, Pencil, Plus,
  RefreshCw, RotateCcw, Save, Search, Send, Trash2, Upload, X
} from 'lucide-react'

const ICONS: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  plus: Plus, pencil: Pencil, trash: Trash2, save: Save, search: Search, refresh: RefreshCw, back: ArrowLeft, next: ArrowRight,
  download: Download, upload: Upload, eye: Eye, filter: Filter, file: FileText, link: Link2, send: Send, calc: Calculator,
  copy: Copy, undo: RotateCcw, check: Check, x: X, logout: LogOut
}

/** The first rule that matches a button's label decides its icon. */
const RULES: [string, RegExp][] = [
  ['logout', /^(sign|log)\s?out/],
  ['plus', /^(add|create|new)\b/],
  ['pencil', /^(edit|amend|modify|change)\b/],
  ['trash', /^(delete|remove|discard)\b/],
  ['save', /^(save|update|submit)\b/],
  ['search', /^(search|find|look\s?up)\b/],
  ['refresh', /^(refresh|reload|retry)\b/],
  ['back', /^(back|previous)\b/],
  ['next', /^(next|continue|proceed)\b/],
  ['download', /^(download|export)\b/],
  ['upload', /^(upload|import|post)\b/],
  ['eye', /^(view|show|open|details|preview)\b/],
  ['filter', /^filter\b/],
  ['file', /^(generate|print|invoice|report)\b/],
  ['link', /^(assign|allocate|link|match)\b/],
  ['send', /^(send|release|forward)\b/],
  ['calc', /^calculate\b/],
  ['copy', /^copy\b/],
  ['undo', /^(reset|clear|undo|revert)\b/],
  ['check', /^(apply|confirm|approve|accept|ok|yes|done|finali[sz]e|execute|settle)\b/],
  ['x', /^(close|cancel|dismiss|reject|no|decline|terminate)\b/]
]

/** Where screens render their buttons: the page wrapper, the portals their pop-ups use, and the Trade Flows frame. */
const SCOPES = ['#alm-fx-ui', '.std-pop-overlay', '.slc-dialog-overlay', '.tsfx-frame', '.tsfx-portal']
const BUTTONISH = /btn|button|action|common|tb-|reset/i
/** Characters that are not letters or digits: the symbol a label may start with (+, ✓, ↻, ⚠, ←, ×, an emoji…). */
const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u
const NO_LETTERS_OR_DIGITS = /^[^\p{L}\p{N}]*$/u

/** The icons a button already carries as elements: hand-drawn SVGs, images, icon spans (a glyph or nothing as text). */
function ownIconElements(button: HTMLButtonElement): Element[] {
  return [...button.querySelectorAll('svg:not(.lucide), img, i, em, span, b, [class*="icon" i]')].filter((el) => {
    if (el.closest('[data-ico-old]') || el.querySelector('svg.lucide')) return false
    if (el.matches('svg, img')) return true
    return NO_LETTERS_OR_DIGITS.test(el.textContent ?? '')
  })
}

/** The first non-blank text node of the button when it starts with a symbol and still has a word after it. */
function symbolText(button: HTMLButtonElement): Text | null {
  for (const node of button.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) {
      if (node instanceof Element && node.hasAttribute('data-ico-old')) continue
      return null
    }
    const text = node as Text
    if (!(text.nodeValue ?? '').trim()) continue
    const rest = (text.nodeValue ?? '').replace(LEADING_SYMBOLS, '')
    return rest !== (text.nodeValue ?? '').trimStart() && /\p{L}/u.test(rest) ? text : null
  }
  return null
}

/** The icon a button should get, '' for none. */
function iconFor(button: HTMLButtonElement): string {
  if (button.getAttribute('role') === 'tab' || button.closest('th, .pagination')) return ''
  if (!BUTTONISH.test(button.className)) return ''
  if (button.querySelector('svg.lucide')) return ''            // already carries a new icon
  const label = (button.textContent ?? '').trim().toLowerCase().replace(LEADING_SYMBOLS, '')
  if (label.length < 2 || label.length > 40) return ''
  return RULES.find(([, re]) => re.test(label))?.[0] ?? ''
}

/** Takes a button's previous icon out of sight: its elements, a symbol in its label, and icons drawn by CSS. */
function hideOwnIcon(button: HTMLButtonElement): void {
  ownIconElements(button).forEach((el) => el.setAttribute('data-ico-old', ''))
  const text = symbolText(button)
  if (text) text.nodeValue = (text.nodeValue ?? '').replace(LEADING_SYMBOLS, '')
  const after = getComputedStyle(button, '::after').content
  if (after && after !== 'none' && after !== 'normal') button.setAttribute('data-ico-after-off', '')
}

/**
 * Confirming reads green and rejecting reads red on every screen: `ok` for Confirm / Approve / Release (also Match &
 * Release), `bad` for Reject / Decline / Correction Required; `-fill` when the button is the filled primary one.
 * Generate Invoices keeps its blue Confirm Invoice.
 */
function toneFor(button: HTMLButtonElement): string {
  if (button.closest('.invblotter, th, .pagination') || button.getAttribute('role') === 'tab' || !BUTTONISH.test(button.className)) return ''
  const label = (button.textContent ?? '').trim().toLowerCase()
  if (label.length > 40) return ''
  const tone = /\b(reject|decline)\b|correction required/.test(label) ? 'bad' : /\b(confirm|approve|release)\b/.test(label) ? 'ok' : ''
  if (!tone) return createTone(button)
  const filled = /primary|btn-confirm|tb-primary/.test(button.className) || (/(^|\s)button(\s|$)/.test(button.className) && !/secondary|danger/.test(button.className))
  return filled ? `${tone}-fill` : tone
}

/** A button that creates something (Create / Add / New …) in the page itself, not in a dialog: drawn as the light "Transaction" pill. */
function createTone(button: HTMLButtonElement): string {
  if (button.closest('.modal, .modal-overlay, .ds-modal, .std-pop, [role="dialog"]')) return ''
  const label = (button.textContent ?? '').trim().toLowerCase().replace(LEADING_SYMBOLS, '')
  return label.length <= 40 && /^(create|add|new|load blotter|mark for invoicing|initiate settlement)\b/.test(label) ? 'create' : ''
}

function sweep(): void {
  const query = SCOPES.map((s) => `${s} button:not([data-ico])`).join(', ')
  document.querySelectorAll<HTMLButtonElement>(query).forEach((b) => {
    const icon = iconFor(b)
    if (icon) hideOwnIcon(b)
    b.setAttribute('data-ico', icon || 'none')
    const tone = toneFor(b)
    if (tone) b.setAttribute('data-tone', tone)
  })
  sweepKeyColumns()
}

function stylesheet(): string {
  const icons = Object.entries(ICONS).map(([name, Icon]) => {
    const svg = renderToStaticMarkup(createElement(Icon, { size: 14, color: '#000', strokeWidth: 2 }))
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    const pseudo = SCOPES.map((s) => `${s} button[data-ico="${name}"]::before`).join(', ')
    return `${pseudo}{content:"";display:inline-block;width:14px;height:14px;flex:none;background:currentColor;-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat}`
  })
  // The previous icon of a button that now has the new one.
  icons.push('button[data-ico][data-ico] [data-ico-old][data-ico-old]{display:none!important}', 'button[data-ico-after-off][data-ico-after-off]::after{content:none!important;display:none!important}')
  return icons.join('\n')
}

let installed = false
/** Starts giving buttons their icons; safe to call more than once. */
export function installButtonIcons(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const style = document.createElement('style')
  style.setAttribute('data-button-icons', '')
  style.textContent = stylesheet()
  document.head.appendChild(style)
  let queued = false
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sweep() }) }
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true })
  later()
}
