export const SERIES_TIME_UNITS = ['fs', 'ps', 'ns', 'µs', 'ms', 's', 'min', 'h'] as const
export type SeriesTimeUnit = (typeof SERIES_TIME_UNITS)[number]

export interface SeriesCoordinate {
  value: number
  unit: SeriesTimeUnit
}

const SECONDS_PER_UNIT: Record<SeriesTimeUnit, number> = {
  fs: 1e-15, ps: 1e-12, ns: 1e-9, 'µs': 1e-6, ms: 1e-3, s: 1, min: 60, h: 3600,
}

const UNIT_ALIASES: Record<string, SeriesTimeUnit> = {
  fs: 'fs', ps: 'ps', ns: 'ns', 'µs': 'µs', 'μs': 'µs', us: 'µs', ms: 'ms',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
}

const CLOCK_PATTERN = /(?<![\d:.])(\d{1,3}):([0-5]\d):([0-5]\d(?:\.\d+)?)(?![\d:])/g
const QUANTITY_PATTERN = /(?<![A-Za-z\d.])(-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)\s*(fs|ps|ns|µs|μs|us|ms|seconds?|secs?|s|minutes?|mins?|min|hours?|hrs?|hr|h)(?![A-Za-zµμ])/g

export function convertSeriesCoordinate(value: number, from: SeriesTimeUnit, to: SeriesTimeUnit): number {
  return (value * SECONDS_PER_UNIT[from]) / SECONDS_PER_UNIT[to]
}

/**
 * Reads a time coordinate from a series label such as `t = 30 s`, `kinetics_2.5min`
 * or `00:01:30`. Labels with no time or more than one candidate return null rather
 * than a guessed value.
 */
export function parseSeriesCoordinate(label: string): SeriesCoordinate | null {
  const clock = [...label.matchAll(CLOCK_PATTERN)]
  const quantities = [...label.matchAll(QUANTITY_PATTERN)]
  if (clock.length + quantities.length !== 1) return null

  if (clock.length === 1) {
    const [, hours, minutes, seconds] = clock[0]
    return { value: Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds), unit: 's' }
  }

  const [, rawValue, rawUnit] = quantities[0]
  const unit = UNIT_ALIASES[rawUnit]
  const value = Number(rawValue.replace(',', '.'))
  return unit && Number.isFinite(value) ? { value, unit } : null
}

export function isSeriesTimeUnit(value: unknown): value is SeriesTimeUnit {
  return SERIES_TIME_UNITS.includes(value as SeriesTimeUnit)
}

export interface CoordinateSource {
  label: string
  seriesCoordinate?: SeriesCoordinate | null
}

export type ResolvedSeriesCoordinates =
  | { kind: 'time'; values: number[]; unit: SeriesTimeUnit }
  | { kind: 'index'; values: number[]; missing: string[]; duplicates: boolean }

/** Manual coordinates take precedence over values parsed from labels. */
export function resolveSeriesCoordinates(
  sources: CoordinateSource[],
  targetUnit: SeriesTimeUnit,
): ResolvedSeriesCoordinates {
  const coordinates = sources.map((source) => source.seriesCoordinate ?? parseSeriesCoordinate(source.label))
  const missing = sources.filter((_, index) => coordinates[index] === null).map((source) => source.label)
  const values = coordinates.map((coordinate) =>
    coordinate ? convertSeriesCoordinate(coordinate.value, coordinate.unit, targetUnit) : Number.NaN,
  )
  const duplicates = new Set(values.filter((value) => Number.isFinite(value))).size
    !== values.filter((value) => Number.isFinite(value)).length

  if (missing.length === 0 && !duplicates) return { kind: 'time', values, unit: targetUnit }
  return { kind: 'index', values: sources.map((_, index) => index + 1), missing, duplicates }
}
