import type { TransformDefinition } from '../types/project'

// Ordered to match processing.py ORDER so the GUI mirrors execution order.
const PIPELINE_BLUEPRINT: TransformDefinition[] = [
  { id: 'crop-1', type: 'crop', scope: 'individual', enabled: false, params: { x_min: 0, x_max: 0 } },
  { id: 'baseline-1', type: 'baseline', scope: 'individual', enabled: false, params: { order: 3 } },
  { id: 'smooth-1', type: 'smoothing', scope: 'individual', enabled: true, params: { window_length: 15, polyorder: 2 } },
  { id: 'invert-1', type: 'inversion', scope: 'individual', enabled: false, params: {} },
  { id: 'normalize-1', type: 'normalization', scope: 'individual', enabled: true, params: { mode: 'minmax' } },
  { id: 'peakfit-1', type: 'peak_localisation', scope: 'individual', enabled: false, params: { model: 'gaussian', prominence: 0.05 } },
]

/** Fills in missing steps and drops steps that are no longer part of the blueprint. */
export function buildPipeline(abscissa: number[], existing: TransformDefinition[] = []): TransformDefinition[] {
  let xMin = abscissa[0] ?? 0
  let xMax = abscissa[0] ?? 0
  for (const value of abscissa) {
    if (value < xMin) xMin = value
    if (value > xMax) xMax = value
  }

  return PIPELINE_BLUEPRINT.map((blueprint) => {
    const current = existing.find((step) => step.type === blueprint.type)
    if (current) {
      return current
    }

    return {
      ...blueprint,
      params: blueprint.type === 'crop' ? { x_min: xMin, x_max: xMax } : { ...blueprint.params },
    }
  })
}
