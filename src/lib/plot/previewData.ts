import type { SpectrumDataset, SpectrumType } from '../../types/project'
import { getSpectrumStyleDefaults } from '../../types/project'
import type { StartupAxisPreferences } from '../../services/startupPreferences'
import { axisDefaultsFor, isPercentUnit } from '../../services/spectrumPresets'
import { canConvertAbscissa, convertAbscissa } from '../../services/import/unitConversion'

const PREVIEW_TIMES_S = [0, 60, 120, 240, 480]
const PREVIEW_COLORS = ['#e09a57', '#76b8b1', '#9b8ad8', '#d97393', '#8cc46b']

interface Band { center: number; width: number; start: number; end: number }

const BANDS: Record<SpectrumType, { from: number; to: number; step: number; bands: Band[] }> = {
  'uv-vis': {
    from: 250, to: 700, step: 5,
    bands: [
      { center: 420, width: 32, start: 0.9, end: 0.15 },
      { center: 560, width: 42, start: 0.05, end: 0.7 },
    ],
  },
  ir: {
    from: 4000, to: 600, step: -10,
    bands: [
      { center: 2950, width: 40, start: 0.35, end: 0.3 },
      { center: 1710, width: 18, start: 0.9, end: 0.2 },
      { center: 1640, width: 20, start: 0.05, end: 0.75 },
      { center: 1250, width: 30, start: 0.5, end: 0.45 },
    ],
  },
  raman: {
    from: 200, to: 3200, step: 10,
    bands: [
      { center: 1000, width: 12, start: 0.8, end: 0.3 },
      { center: 1600, width: 18, start: 0.2, end: 0.9 },
      { center: 2900, width: 35, start: 0.5, end: 0.5 },
    ],
  },
}

function signal(type: SpectrumType, x: number, progress: number): number {
  return BANDS[type].bands.reduce((sum, band) => {
    const amplitude = band.start + (band.end - band.start) * progress
    return sum + amplitude * Math.exp(-0.5 * ((x - band.center) / band.width) ** 2)
  }, 0.02)
}

/** Maps a generic absorbance-like signal onto the requested ordinate quantity and unit. */
function ordinateFor(quantity: string, unit: string, value: number): number {
  const percent = isPercentUnit(unit) ? 100 : 1
  if (quantity === 'Transmittance') return 10 ** -value * percent
  if (quantity === 'Reflectance') return (1 - value / 2) * percent
  if (quantity === 'Counts') return Math.round(value * 1000)
  return value * percent
}

export interface PreviewDatasets {
  datasets: SpectrumDataset[]
  notices: string[]
}

/** Synthetic time-resolved series in the chosen technique, converted into the chosen plot units. */
export function buildPreviewDatasets(spectrumType: SpectrumType, axes: StartupAxisPreferences): PreviewDatasets {
  const config = BANDS[spectrumType]
  const sourceUnit = axisDefaultsFor(spectrumType).x
  const source: number[] = []
  for (let x = config.from; config.step > 0 ? x <= config.to : x >= config.to; x += config.step) source.push(x)

  const notices: string[] = []
  let abscissa = source
  let xUnit = axes.xUnit
  let xQuantity = axes.xQuantity
  if (sourceUnit !== axes.xUnit) {
    if (canConvertAbscissa(sourceUnit, axes.xUnit) && !(spectrumType === 'raman')) {
      abscissa = convertAbscissa(source, sourceUnit, axes.xUnit)
    } else {
      notices.push(`${xQuantity} in ${axes.xUnit} cannot be derived from ${spectrumType.toUpperCase()} data in ${sourceUnit}; imports with these settings will be rejected.`)
      xUnit = sourceUnit
      xQuantity = axisDefaultsFor(spectrumType).xQuantity
    }
  }

  const datasets = PREVIEW_TIMES_S.map((time, index): SpectrumDataset => {
    const progress = 1 - Math.exp(-time / 180)
    const ordinate = source.map((x) => ordinateFor(axes.yQuantity, axes.yUnit, signal(spectrumType, x, progress)))
    return {
      id: `preview-${index}`,
      name: 'preview',
      sourcePath: 'preview',
      spectrumType,
      units: { x: xUnit, y: axes.yUnit, xQuantity, yQuantity: axes.yQuantity },
      data: { abscissa, ordinateOriginal: ordinate, ordinateModified: ordinate, precision: 'float64' },
      pipeline: [],
      style: {
        lineColor: PREVIEW_COLORS[index % PREVIEW_COLORS.length],
        lineWidth: 2,
        scatterSymbol: 'circle',
        label: `t = ${time} s`,
        ...getSpectrumStyleDefaults(spectrumType),
      },
      peaks: [],
      // Both standard third-axis fields are present so the preview follows the chosen axis.
      experimentMetadata: { Time: `${time} s`, Concentration: `${(1 - progress).toFixed(3)} mM` },
    }
  })
  return { datasets, notices }
}
