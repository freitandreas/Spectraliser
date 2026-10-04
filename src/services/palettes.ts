export type PaletteKind = 'single' | 'rainbow' | 'gradient'

export interface ColorPalette {
  id: string
  name: string
  kind: PaletteKind
  /** Gradient stops, evenly spaced; samples are spread across the full gradient. */
  stops: string[]
}

/** Position of a sample within the project; the palette is stretched over `count` samples. */
export interface PaletteSlot {
  index: number
  count: number
}

// Stops avoid near-black ends so every sample stays legible on the dark plot background.
export const COLOR_PALETTES: ColorPalette[] = [
  { id: 'rainbow', name: 'Rainbow', kind: 'rainbow', stops: ['#ff4d4d', '#ff9f40', '#ffe14d', '#5ce65c', '#4dd2ff', '#4d79ff', '#b366ff'] },
  { id: 'turbo', name: 'Turbo', kind: 'gradient', stops: ['#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#d93806'] },
  { id: 'viridis', name: 'Viridis', kind: 'gradient', stops: ['#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'] },
  { id: 'plasma', name: 'Plasma', kind: 'gradient', stops: ['#7e03a8', '#b12a90', '#cc4778', '#e16462', '#f2844b', '#fca636', '#f0f921'] },
  { id: 'ocean', name: 'Ocean', kind: 'gradient', stops: ['#5c7cfa', '#1c7ed6', '#22b8cf', '#38d9a9', '#a9e34b'] },
  { id: 'sunset', name: 'Sunset', kind: 'gradient', stops: ['#cc5de8', '#e64980', '#ff6b6b', '#ff922b', '#ffd43b'] },
  { id: 'default', name: 'Blue', kind: 'single', stops: ['#d0ebff', '#74c0fc', '#339af0', '#1c7ed6'] },
  { id: 'green', name: 'Green', kind: 'single', stops: ['#d3f9d8', '#8ce99a', '#40c057', '#2b8a3e'] },
  { id: 'red', name: 'Red', kind: 'single', stops: ['#ffe3e3', '#ffa8a8', '#fa5252', '#c92a2a'] },
  { id: 'mono', name: 'Monochrome', kind: 'single', stops: ['#f1f3f5', '#ced4da', '#adb5bd', '#868e96', '#5c636a'] },
]

export const PALETTE_KIND_LABELS: Record<PaletteKind, string> = {
  rainbow: 'Rainbow',
  gradient: 'Multi-colour gradients',
  single: 'Single colour',
}

export const DEFAULT_PALETTE_ID = 'rainbow'

export function findPalette(paletteId: string): ColorPalette {
  return COLOR_PALETTES.find((entry) => entry.id === paletteId)
    ?? COLOR_PALETTES.find((entry) => entry.id === DEFAULT_PALETTE_ID)!
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHex(rgb: number[]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** Colour at position `t` ∈ [0, 1] along the palette gradient (linear RGB interpolation between stops). */
export function paletteColorAt(paletteId: string, t: number): string {
  const stops = findPalette(paletteId).stops
  if (stops.length === 1) return stops[0]!
  const scaled = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const lower = Math.min(stops.length - 2, Math.floor(scaled))
  const fraction = scaled - lower
  const from = hexToRgb(stops[lower]!)
  const to = hexToRgb(stops[lower + 1]!)
  return rgbToHex(from.map((channel, i) => channel + (to[i]! - channel) * fraction))
}

/** Distinct colour for every sample: the gradient is sampled evenly from its first to its last stop. */
export function paletteColor(paletteId: string, slot: PaletteSlot): string {
  const t = slot.count <= 1 ? 0 : slot.index / (slot.count - 1)
  return paletteColorAt(paletteId, t)
}

export function paletteGradientCss(paletteId: string): string {
  return `linear-gradient(90deg, ${findPalette(paletteId).stops.join(', ')})`
}
