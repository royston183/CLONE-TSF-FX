/** Native drag image; the action continues through the screen's existing handlers. */
export function masterContractDragImage(dataTransfer: DataTransfer, label: string) {
  const ghost = document.createElement('div')
  ghost.className = 'mc-drag-ghost'
  ghost.textContent = label
  document.body.appendChild(ghost)
  dataTransfer.setDragImage(ghost, 12, 14)
  setTimeout(() => ghost.remove(), 0)
}
