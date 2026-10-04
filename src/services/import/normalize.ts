import type { SpectrumType } from '../../types/project'
import type { ParsedSpectrumSeries } from './parsers'
import type { StartupAxisPreferences } from '../startupPreferences'
import { axisDefaultsFor } from '../spectrumPresets'
import { convertAbscissa } from './unitConversion'
import { percentScaleFactor } from '../spectrumPresets'

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
  const sourceYUnit = series.yUnit ?? defaults.y
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
  const yScale = percentScaleFactor(sourceYUnit, targetAxes.yUnit)
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
