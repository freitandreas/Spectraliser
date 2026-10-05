import { describe, expect, it } from 'vitest'
import { applyExportAppearance } from '../src/lib/plot/exportAppearance'
import { cameraFromRelayout } from '../src/lib/plot/sceneCamera'
import { exportImageScale, exportLayoutSize, exportPixelSize, DEFAULT_EXPORT_SETTINGS } from '../src/services/export/exportSettings'

const camera = { eye: { x: 1, y: 2, z: 0.5 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } }

describe('export figure appearance', () => {
  it('lays the figure out at its physical size and scales the raster to the resolution', () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, widthCm: 2.54, heightCm: 1.27, dpi: 300 }
    expect(exportLayoutSize(settings)).toEqual({ width: 96, height: 48 })
    expect(exportPixelSize(settings)).toEqual({ width: 300, height: 150 })
    expect(exportImageScale(settings)).toBeCloseTo(300 / 96)
  })

  it('applies fixed size, point-based fonts, and the workspace camera', () => {
    const layout = applyExportAppearance({ autosize: true, scene: { xaxis: {}, yaxis: {}, zaxis: {} } }, {
      width: 400, height: 300, fontFamily: 'Arial', fontSizePt: 12, background: 'white', showPeaks: false, camera,
    })
    expect(layout.autosize).toBe(false)
    expect(layout.width).toBe(400)
    expect((layout.font as { size: number }).size).toBeCloseTo(16)
    expect((layout.scene as { camera: unknown }).camera).toEqual(camera)
  })

  it('reads the camera from a Plotly relayout event', () => {
    expect(cameraFromRelayout({ 'scene.camera': camera }, null)).toEqual(camera)
    expect(cameraFromRelayout({ 'xaxis.range[0]': 3 }, null)).toBeNull()
  })
})
