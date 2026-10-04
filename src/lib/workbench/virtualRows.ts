export interface RowWindow {
  start: number
  end: number
  padTop: number
  padBottom: number
}

/** Rows to render for a fixed-height list; only the visible slice plus `overscan` rows on each side. */
export function rowWindow(scrollTop: number, viewport: number, rowHeight: number, total: number, overscan = 12): RowWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(0, viewport) / rowHeight) + 1
  const start = Math.max(0, Math.min(total - 1, first - overscan))
  const end = Math.min(total, first + visible + overscan)
  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight }
}

/** Scroll position that brings row `index` into view with a small margin, or null if it is already visible. */
export function scrollToRow(index: number, scrollTop: number, viewport: number, rowHeight: number, headerHeight: number, margin = 8): number | null {
  const top = index * rowHeight
  const bottom = top + rowHeight
  const visibleTop = scrollTop
  const visibleBottom = scrollTop + viewport - headerHeight
  if (top < visibleTop) return Math.max(0, top - margin)
  if (bottom > visibleBottom) return bottom - (viewport - headerHeight) + margin
  return null
}
