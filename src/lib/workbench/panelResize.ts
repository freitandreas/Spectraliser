import type { ResizeKind } from './workbenchUtils'

export interface PanelSizes {
  left: number
  right: number
  bottom: number
}

export interface ResizeLimits {
  layoutWidth: number
  mainHeight: number
}

export interface ActiveResize {
  kind: ResizeKind
  startX: number
  startY: number
  start: PanelSizes
}

export function beginResize(kind: ResizeKind, event: MouseEvent, sizes: PanelSizes): ActiveResize {
  return {
    kind,
    startX: event.clientX,
    startY: event.clientY,
    start: { ...sizes },
  }
}

/** Returns the next panel sizes for a drag, clamped so the plot keeps usable space. */
export function resolveResize(
  active: ActiveResize,
  event: MouseEvent,
  sizes: PanelSizes,
  limits: ResizeLimits,
): PanelSizes {
  if (active.kind === 'left') {
    const dx = event.clientX - active.startX
    const maxLeft = Math.max(220, limits.layoutWidth - sizes.right - 460)
    return { ...sizes, left: Math.min(maxLeft, Math.max(180, active.start.left + dx)) }
  }

  if (active.kind === 'right') {
    const dx = event.clientX - active.startX
    const maxRight = Math.max(240, limits.layoutWidth - sizes.left - 500)
    return { ...sizes, right: Math.min(maxRight, Math.max(240, active.start.right - dx)) }
  }

  if (limits.mainHeight <= 0) {
    return sizes
  }

  const dy = event.clientY - active.startY
  const maxBottom = Math.max(220, limits.mainHeight - 220)
  return { ...sizes, bottom: Math.min(maxBottom, Math.max(180, active.start.bottom - dy)) }
}

export function createPanelResizer(
  sizes: () => PanelSizes,
  limits: () => ResizeLimits,
  apply: (next: PanelSizes) => void,
): { start: (kind: ResizeKind, event: MouseEvent) => void; stop: () => void } {
  let active: ActiveResize | null = null
  let previousStyle = { userSelect: '', cursor: '' }
  function move(event: MouseEvent): void {
    if (active) apply(resolveResize(active, event, sizes(), limits()))
  }
  function stop(): void {
    if (!active) return
    active = null
    document.body.style.userSelect = previousStyle.userSelect
    document.body.style.cursor = previousStyle.cursor
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', stop)
  }
  return {
    start(kind, event) {
      stop()
      event.preventDefault()
      active = beginResize(kind, event, sizes())
      previousStyle = { userSelect: document.body.style.userSelect, cursor: document.body.style.cursor }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = kind === 'bottom' ? 'row-resize' : 'col-resize'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', stop)
    },
    stop,
  }
}
