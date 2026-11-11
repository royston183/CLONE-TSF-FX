/** The element dialogs, toasts and pop-overs of the TSF_FX screens are rendered into: a `.tsfx` root of its own, so their (scoped) styles apply. */
export function tsfxPortalRoot(): HTMLElement {
  let el = document.getElementById('tsfx-portal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tsfx-portal';
    el.className = 'tsfx tsfx-portal';
    document.body.appendChild(el);
  }
  return el;
}
