/**
 * Every popup closes when its dimmed backdrop is clicked (`e.target === e.currentTarget`). A drag that starts
 * inside the card — selecting the text of an input, say — and is released over the backdrop makes the browser
 * fire that click on the backdrop (the common ancestor), so the popup closed under the user.
 *
 * One capture-phase guard for the whole app: a click whose target is an overlay / backdrop, but whose press
 * started on something inside it, is swallowed before any popup sees it. A click that really started on the
 * backdrop is untouched, so click-outside-to-close still works.
 */
const BACKDROP = /overlay|backdrop/i

export function installBackdropGuard(doc: Document = document): () => void {
  let pressed: EventTarget | null = null
  const onDown = (e: MouseEvent) => {
    pressed = e.target
  }
  const onClick = (e: MouseEvent) => {
    const target = e.target
    if (!(target instanceof HTMLElement) || !BACKDROP.test(target.className.toString())) return
    if (pressed instanceof Node && pressed !== target && target.contains(pressed)) e.stopImmediatePropagation()
  }
  doc.addEventListener('mousedown', onDown, true)
  doc.addEventListener('click', onClick, true)
  return () => {
    doc.removeEventListener('mousedown', onDown, true)
    doc.removeEventListener('click', onClick, true)
  }
}
