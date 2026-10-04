import type { SpectrumType } from '../../types/project'
import type { ParsedSpectrumSeries } from './parsers'
import type { StartupAxisPreferences } from '../startupPreferences'
import { axisDefaultsFor } from '../spectrumPresets'
import { convertAbscissa } from './unitConversion'
import { ordinateUnitFactor } from '../spectrumPresets'
import { finiteRange } from '../numeric'

const FRACTION_QUANTITIES = ['transmittance', 'reflectance']

/**
 * Source ordinate unit when the header states none. Transmittance and reflectance are
 * bounded, so values above 1.5 can only be percent; anything else is taken to be
 * recorded in the target unit already rather than rescaled on a guess.
 */
function inferSourceOrdinateUnit(series: ParsedSpectrumSeries, targetAxes: StartupAxisPreferences): string {
  const quantity = (series.yQuantity ?? targetAxes.yQuantity).trim().toLowerCase()
  if (!FRACTION_QUANTITIES.includes(quantity)) return targetAxes.yUnit
  const range = finiteRange(series.ordinate)
  return range && range[1] > 1.5 ? '%' : ''
}

export function normalizeImportedSeries(
  series: ParsedSpectrumSeries,
  spectrumType: SpectrumType,
  targetAxes: StartupAxisPreferences,
): {
  abscissa: number[]
  ordinate: number[]
  xUnit: string
  yUnit: string
  xQuantity: string
  yQuantity: string
  spectrumType: SpectrumType
} {
  const defaults = axisDefaultsFor(spectrumType)
  const sourceXUnit = series.xUnit ?? defaults.x
  const sourceYUnit = series.yUnit ?? inferSourceOrdinateUnit(series, targetAxes)
  let abscissa = series.abscissa
  let ordinate = series.ordinate

  if (
    (series.xQuantity === 'Raman shift' || (spectrumType === 'raman' && targetAxes.xQuantity === 'Raman shift'))
    && !['cm^-1', 'cm⁻¹', '1/cm'].includes(sourceXUnit)
  ) {
    throw new Error('Raman-shift data must use inverse-centimetre units; conversion to wavelength requires excitation-laser metadata.')
  }
  if (
    (series.xQuantity === 'Raman shift' || (spectrumType === 'raman' && targetAxes.xQuantity === 'Raman shift'))
    && !['cm^-1', 'cm⁻¹', '1/cm'].includes(targetAxes.xUnit)
  ) {
    throw new Error('Raman shift cannot be converted to wavelength without excitation-laser metadata.')
  }

  if (sourceXUnit !== targetAxes.xUnit) {
    abscissa = convertAbscissa(abscissa, sourceXUnit, targetAxes.xUnit)
  }
  const yScale = ordinateUnitFactor(sourceYUnit, targetAxes.yUnit)
  if (yScale !== null) ordinate = ordinate.map((value) => value * yScale)

  return {
    abscissa,
    ordinate,
    xUnit: targetAxes.xUnit,
    yUnit: targetAxes.yUnit,
    xQuantity: targetAxes.xQuantity,
    yQuantity: targetAxes.yQuantity,
    spectrumType,
  }
}
