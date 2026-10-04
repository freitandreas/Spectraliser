const MIN_SIDE_WIDTH = 264
const MIN_MAIN_WIDTH = 320

/** Drags the right-hand side column of a split view; the main column keeps at least MIN_MAIN_WIDTH. */
export function startSideColumnResize(
  event: PointerEvent,
  container: HTMLElement | null,
  startWidth: number,
  setWidth: (width: number) => void,
): void {
  if (!container) return
  event.preventDefault()
  const startX = event.clientX
  const maxWidth = Math.max(280, container.getBoundingClientRect().width - MIN_MAIN_WIDTH)

  const handleMove = (moveEvent: PointerEvent): void => {
    setWidth(Math.min(maxWidth, Math.max(MIN_SIDE_WIDTH, startWidth + startX - moveEvent.clientX)))
  }
  const handleUp = (): void => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}
