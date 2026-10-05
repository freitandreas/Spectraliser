import type { SceneCamera } from './sceneCamera'

export interface ExportAppearance {
  /** Layout size in CSS pixels (physical size at 96 dpi). */
  width: number
  height: number
  fontFamily: string
  fontSizePt: number
  background: 'white' | 'transparent' | 'dark'
  showPeaks: boolean
  camera: SceneCamera | null
}

type Layout = Record<string, unknown>
type Annotation = Record<string, unknown>

const PT_TO_PX = 96 / 72

function palette(background: ExportAppearance['background']) {
  const dark = background === 'dark'
  return {
    paper: dark ? '#141519' : background === 'transparent' ? 'rgba(0,0,0,0)' : '#ffffff',
    scene: dark ? '#141519' : background === 'transparent' ? 'rgba(0,0,0,0)' : '#ffffff',
    text: dark ? '#d4d4d4' : '#171717',
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)',
    zero: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)',
    line: dark ? '#858b92' : '#404040',
  }
}

function themedAxis(axis: unknown, colors: ReturnType<typeof palette>, sceneBackground?: string): Layout | undefined {
  if (!axis || typeof axis !== 'object') return undefined
  const source = axis as Layout
  const gridVisible = source.showgrid !== false
  return {
    ...source,
    gridcolor: gridVisible ? colors.grid : 'rgba(0,0,0,0)',
    zerolinecolor: colors.zero,
    ...(source.linecolor ? { linecolor: colors.line } : {}),
    tickfont: { ...((source.tickfont as Layout | undefined) ?? {}), color: colors.text },
    ...(sceneBackground ? { backgroundcolor: sceneBackground } : {}),
  }
}

/**
 * Turns a workspace figure layout into a static document figure: fixed physical size, the
 * document font, a light or dark page theme, and the workspace 3D camera.
 */
export function applyExportAppearance(layout: Layout, appearance: ExportAppearance): Layout {
  const colors = palette(appearance.background)
  const fontSize = appearance.fontSizePt * PT_TO_PX
  const next: Layout = {
    ...layout,
    autosize: false,
    width: appearance.width,
    height: appearance.height,
    paper_bgcolor: colors.paper,
    plot_bgcolor: colors.paper,
    font: { ...((layout.font as Layout | undefined) ?? {}), family: appearance.fontFamily, size: fontSize, color: colors.text },
    legend: { ...((layout.legend as Layout | undefined) ?? {}), bgcolor: 'rgba(0,0,0,0)', borderwidth: 0 },
    annotations: ((layout.annotations as Annotation[] | undefined) ?? []).map((annotation) => ({
      ...annotation,
      font: {
        ...((annotation.font as Layout | undefined) ?? {}),
        family: appearance.fontFamily,
        size: fontSize * 0.85,
        // Labels drawn on a backing box keep their contrast colour; free-standing ones follow the page.
        ...(annotation.bgcolor ? {} : { color: colors.text }),
      },
    })),
  }
  for (const key of ['xaxis', 'yaxis']) {
    const axis = themedAxis(layout[key], colors)
    if (axis) next[key] = axis
  }
  const scene = layout.scene as Layout | undefined
  if (scene) {
    next.scene = {
      ...scene,
      bgcolor: colors.scene,
      xaxis: themedAxis(scene.xaxis, colors, colors.scene),
      yaxis: themedAxis(scene.yaxis, colors, colors.scene),
      zaxis: themedAxis(scene.zaxis, colors, colors.scene),
      ...(appearance.camera ? { camera: appearance.camera } : {}),
    }
  }
  return next
}

/** Colour bars carry their own tick font colour. */
export function applyExportTraceTheme(traces: Array<Record<string, unknown>>, appearance: ExportAppearance): Array<Record<string, unknown>> {
  const colors = palette(appearance.background)
  return traces.map((trace) => {
    const bar = trace.colorbar as Layout | undefined
    if (!bar) return trace
    return { ...trace, colorbar: { ...bar, tickfont: { ...((bar.tickfont as Layout | undefined) ?? {}), color: colors.text } } }
  })
}
