import type { SpectrumDataset } from '../../types/project'
import { formatUnit } from '../../services/spectrumPresets'

export interface PlotTrace {
  x: number[]
  y: number[]
  type: string
  mode: string
  name: string
  line?: { color: string; width: number }
  opacity?: number
  hoverinfo?: string
  showlegend?: boolean
  marker?: {
    size: number | number[]
    color: string
    symbol?: string
    line: { color: string; width: number }
  }
  hovertemplate?: string
}

export function unitSuffix(unit: string): string {
  const normalized = unit.trim()
  return normalized.length > 0 ? ` ${formatUnit(normalized)}` : ''
}

export function buildPeakTrace(
  dataset: SpectrumDataset,
  peaks: SpectrumDataset['peaks'],
  hoveredId: string | null,
): PlotTrace {
  const xUnit = unitSuffix(dataset.units.x)
  const yUnit = unitSuffix(dataset.units.y)

  return {
    x: peaks.map((peak) => peak.x),
    y: peaks.map((peak) => dataset.data.ordinateModified[peak.index] ?? peak.y),
    type: 'scatter',
    mode: 'markers',
    name: 'Peaks',
    hoverinfo: 'x+y+text',
    marker: {
      size: peaks.map((peak) => (peak.id === hoveredId ? 14 : 9)),
      symbol: 'diamond',
      color: dataset.style.lineColor,
      line: { color: '#f8f8f8', width: 1.5 },
    },
    hovertemplate: `%{x:.6g}${xUnit}<br>%{y:.6g}${yUnit}<extra>${dataset.style.label} peak</extra>`,
  }
}

export function buildLineTraces(
  datasets: SpectrumDataset[],
  selectedSpectrumId: string | null,
  highlightedDatasetId: string | null,
): PlotTrace[] {
  return datasets.map((dataset) => {
    const emphasised = dataset.id === selectedSpectrumId || dataset.id === highlightedDatasetId

    return {
      x: dataset.data.abscissa,
      y: dataset.data.ordinateModified,
      type: 'scatter',
      mode: 'lines',
      name: dataset.style.label,
      line: {
        color: dataset.style.lineColor,
        width: dataset.id === highlightedDatasetId ? dataset.style.lineWidth + 1 : dataset.style.lineWidth,
      },
      opacity: emphasised ? 1 : 0.42,
      hovertemplate: `%{x:.6g}${unitSuffix(dataset.units.x)}<br>%{y:.6g}${unitSuffix(dataset.units.y)}<extra>${dataset.style.label}</extra>`,
    }
  })
}

// Scatter text ignores rotation in this Plotly build, so labels are drawn as rotated annotations.
export function buildPeakAnnotations(dataset: SpectrumDataset | null): Record<string, unknown>[] {
  if (!dataset) {
    return []
  }

  const minima = dataset.peakDetection?.mode === 'minima'

  return dataset.peaks.map((peak) => ({
    x: peak.x,
    y: dataset.data.ordinateModified[peak.index] ?? peak.y,
    text: peak.x.toFixed(2),
    textangle: -90,
    showarrow: false,
    xanchor: 'center',
    yanchor: minima ? 'top' : 'bottom',
    yshift: minima ? -10 : 10,
    font: { color: '#f8f8f8', size: 11 },
  }))
}
