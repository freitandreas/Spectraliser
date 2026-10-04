export type QuantityNotation = 'name' | 'symbol'

export const QUANTITY_NOTATIONS: Array<{ id: QuantityNotation; label: string }> = [
  { id: 'name', label: 'Full names (Wavelength)' },
  { id: 'symbol', label: 'Symbols (λ)' },
]

export interface QuantitySymbol {
  /** Italic base symbol in Unicode. */
  base: string
  /** Upright descriptive subscript, e.g. "norm". */
  sub?: string
  /** TeX of the base symbol; descriptive subscripts are appended by quantityTex. */
  tex: string
}

/** IUPAC Green Book symbols for every quantity the app offers. */
export const QUANTITY_SYMBOLS: Record<string, QuantitySymbol> = {
  Wavelength: { base: 'λ', tex: '\\lambda' },
  Wavenumber: { base: 'ν̃', tex: '\\tilde{\\nu}' },
  'Raman shift': { base: 'Δν̃', tex: '\\Delta\\tilde{\\nu}' },
  Frequency: { base: 'ν', tex: '\\nu' },
  Energy: { base: 'E', tex: 'E' },
  Time: { base: 't', tex: 't' },
  Concentration: { base: 'c', tex: 'c' },
  Absorbance: { base: 'A', tex: 'A' },
  Transmittance: { base: 'T', tex: 'T' },
  Reflectance: { base: 'R', tex: 'R' },
  Intensity: { base: 'I', tex: 'I' },
  Counts: { base: 'N', tex: 'N' },
  'Normalised intensity': { base: 'I', sub: 'norm', tex: 'I' },
  'Series number': { base: 'n', tex: 'n' },
}

function subscripts(symbol: QuantitySymbol | null, extra?: string): string[] {
  const parts = [symbol?.sub, ...(extra?.split(',') ?? [])].map((part) => part?.trim())
  return [...new Set(parts.filter((part): part is string => Boolean(part)))]
}

export function quantitySymbol(quantity: string, notation: QuantityNotation): QuantitySymbol | null {
  return notation === 'symbol' ? QUANTITY_SYMBOLS[quantity] ?? null : null
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/**
 * Quantity markup understood by both browsers and Plotly text (`<i>`, `<sub>`).
 * Symbols are italic and descriptive subscripts upright, following IUPAC.
 */
export function quantityHtml(quantity: string, notation: QuantityNotation, subscript?: string): string {
  const symbol = quantitySymbol(quantity, notation)
  if (!symbol) {
    return escapeHtml(quantity) + (subscript ? `<sub>${escapeHtml(subscript)}</sub>` : '')
  }
  const subs = subscripts(symbol, subscript).map(escapeHtml).join(',')
  return `<i>${escapeHtml(symbol.base)}</i>${subs ? `<sub>${subs}</sub>` : ''}`
}

/** Unformatted text for contexts without markup (WebGL scene titles, CSV headers, examples). */
export function quantityPlain(quantity: string, notation: QuantityNotation, subscript?: string): string {
  const symbol = quantitySymbol(quantity, notation)
  if (!symbol) return subscript ? `${quantity}_${subscript}` : quantity
  const subs = subscripts(symbol, subscript).join(',')
  return subs ? `${symbol.base}_${subs}` : symbol.base
}

function texText(value: string): string {
  return value.replace(/[\\{}$%&#_^~]/g, (char) => (char === '\\' ? '\\backslash ' : `\\${char}`))
}

/** TeX for MathJax axis titles: italic symbols or upright names, upright descriptive subscripts. */
export function quantityTex(quantity: string, notation: QuantityNotation, subscript?: string): string {
  const symbol = quantitySymbol(quantity, notation)
  const subs = subscripts(symbol, subscript).map(texText).join(',')
  const base = symbol ? symbol.tex : `\\text{${texText(quantity)}}`
  return subs ? `${base}_{\\mathrm{${subs}}}` : base
}
