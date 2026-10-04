import { isPercentUnit, ordinateUnitFactor } from './spectrumPresets'

export type OrdinateMap = (value: number) => number

function normalisedQuantity(quantity: string): string {
  return quantity.trim().toLowerCase()
}

export function isAbsorbanceTransmittancePair(fromQuantity: string, toQuantity: string): boolean {
  const pair = [normalisedQuantity(fromQuantity), normalisedQuantity(toQuantity)].sort().join('|')
  return pair === 'absorbance|transmittance'
}

/**
 * Value mapping for an ordinate metadata change, or null when the values stay untouched.
 * Absorbance and transmittance are related by A = −log₁₀(T) with T as a fraction; percent
 * transmittance is scaled first. Same-quantity changes only rescale percent units and
 * throw for units without a common scale.
 */
export function ordinateConversion(fromQuantity: string, fromUnit: string, toQuantity: string, toUnit: string): OrdinateMap | null {
  if (isAbsorbanceTransmittancePair(fromQuantity, toQuantity)) {
    if (normalisedQuantity(fromQuantity) === 'transmittance') {
      const fraction = isPercentUnit(fromUnit) ? 0.01 : 1
      return (value) => {
        const transmittance = value * fraction
        if (!(transmittance > 0)) throw new Error('Transmittance must be positive to convert to absorbance (A = −log₁₀ T).')
        return -Math.log10(transmittance)
      }
    }
    const scale = isPercentUnit(toUnit) ? 100 : 1
    return (value) => {
      if (!Number.isFinite(value)) throw new Error('Absorbance values must be finite to convert to transmittance.')
      return 10 ** -value * scale
    }
  }
  const scale = ordinateUnitFactor(fromUnit, toUnit)
  return scale === null ? null : (value) => value * scale
}

/** Applies a mapping to a whole series, so a single invalid point rejects the conversion. */
export function convertOrdinates(values: number[], map: OrdinateMap | null): number[] {
  return map ? values.map((value) => (Number.isFinite(value) ? map(value) : value)) : values
}
