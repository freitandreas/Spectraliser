import { finiteRange } from '../../services/numeric'
import type { SpectrumDataset } from '../../types/project'
import type { PlotMode } from '../../services/startupPreferences'
import { AxisRangeTween } from './zoomTween'

/** Above this many plotted points a per-frame relayout costs more than a frame, so zoom jumps instead. */
const TWEEN_POINT_LIMIT = 40_000

export interface PeakZoomHost {
  container: () => HTMLDivElement | null
  alive: () => boolean
  relayout: (update: Record<string, unknown>) => void
  datasets: () => SpectrumDataset[]
  peaksDataset: () => SpectrumDataset | null
  mode: () => PlotMode
}

export interface PeakZoom {
  apply: (peakId: string | null) => Promise<void>
  reset: () => void
}

function dataXRange(datasets: SpectrumDataset[]): [number, number] | null {
  return finiteRange(...datasets.map((dataset) => dataset.data.abscissa))
}

/** Zooms the abscissa onto a peak and restores the previous view afterwards (2D modes only). */
export function createPeakZoom(host: PeakZoomHost): PeakZoom {
  const tween = new AxisRangeTween()
  let preZoomRange: [number, number] | null = null
  let generation = 0

  const currentXRange = (): [number, number] | null => {
    const full = (host.container() as unknown as { _fullLayout?: { xaxis?: { range?: number[] } } } | null)?._fullLayout
    const range = full?.xaxis?.range
    return range && range.length === 2 ? [Number(range[0]), Number(range[1])] : null
  }

  const light = (): boolean => {
    if (host.mode() !== 'overlay') return false
    let points = 0
    for (const dataset of host.datasets()) points += dataset.data.abscissa.length
    return points <= TWEEN_POINT_LIMIT
  }

  const moveTo = (from: [number, number], to: [number, number]): Promise<void> => {
    const container = host.container()
    if (!container) return Promise.resolve()
    if (!light()) {
      tween.cancel()
      host.relayout({ 'xaxis.range': to })
      return Promise.resolve()
    }
    return tween.run(container, (target, update) => {
      // A re-render can purge the div between animation frames; such stale relayouts are dropped.
      if (target === host.container()) host.relayout(update)
      return undefined
    }, from, to)
  }

  return {
    reset(): void {
      tween.cancel()
      preZoomRange = null
    },

    async apply(peakId: string | null): Promise<void> {
      if (!host.alive() || host.mode() === 'surface3d') return
      if (!peakId && preZoomRange === null) return
      generation += 1
      const current = generation

      if (peakId) {
        const dataset = host.peaksDataset()
        const peak = dataset?.peaks.find((item) => item.id === peakId)
        const from = currentXRange() ?? dataXRange(host.datasets())
        if (!dataset || !peak || !from) return
        // Captured once per zoom session so hopping between rows still restores the original view.
        if (preZoomRange === null) preZoomRange = from
        const abscissa = dataset.data.abscissa
        const span = Math.abs((abscissa[abscissa.length - 1] ?? 0) - (abscissa[0] ?? 0)) || 1
        const margin = Math.max(span * 0.03, 1)
        const target: [number, number] = from[0] <= from[1]
          ? [peak.x - margin, peak.x + margin]
          : [peak.x + margin, peak.x - margin]
        await moveTo(from, target)
        return
      }

      const restore = preZoomRange ?? dataXRange(host.datasets())
      const from = currentXRange()
      if (!restore || !from) {
        preZoomRange = null
        const reversed = host.datasets().some((dataset) => dataset.style.abscissaInverted)
        host.relayout({ 'xaxis.autorange': reversed ? 'reversed' : true })
        return
      }
      await moveTo(from, restore)
      if (current === generation) preZoomRange = null
    },
  }
}
