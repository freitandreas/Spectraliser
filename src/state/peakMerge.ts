import type { Peak } from '../types/project'

export interface AssignedPeak {
  index: number
  x: number
  y: number
  prominence: number
  label: string
  intensity: 'weak' | 'medium' | 'strong'
  confidence: 'high' | 'medium' | 'low'
  alternatives: string[]
}

export function shouldApplyAssignedPeaks(
  assigned: AssignedPeak[] | undefined,
  spectrumType: string,
): boolean {
  // An empty list means the script found nothing to label, not that detected peaks are gone.
  return spectrumType === 'ir' && Array.isArray(assigned) && assigned.length > 0
}

export function mergeAssignedPeaks(existing: Peak[], assigned: AssignedPeak[]): Peak[] {
  const matched = new Set<string>()
  const merged = assigned.map((peak): Peak => {
    const previous = existing.find(item => item.index === peak.index &&
      Math.abs(item.x - peak.x) <= Math.max(1, Math.abs(peak.x) * 0.0005))
    if (previous) matched.add(previous.id)
    return {
      id: previous?.id ?? crypto.randomUUID(),
      index: peak.index,
      x: peak.x,
      y: peak.y,
      prominence: peak.prominence,
      label: previous?.labelEdited ? previous.label : peak.label,
      labelEdited: previous?.labelEdited ?? false,
      source: previous?.source ?? 'auto',
      enabled: previous?.enabled ?? true,
      intensity: peak.intensity,
      confidence: peak.confidence,
      alternatives: peak.alternatives,
    }
  })
  // Keep manually inserted peaks that detection missed, including their labels.
  return [...merged, ...existing.filter(peak => peak.source === 'manual' && !matched.has(peak.id))]
    .sort((a, b) => a.x - b.x)
}
