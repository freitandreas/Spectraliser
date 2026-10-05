import { writable } from 'svelte/store'

export interface SceneCamera {
  eye: { x: number; y: number; z: number }
  up: { x: number; y: number; z: number }
  center: { x: number; y: number; z: number }
  projection?: { type: string }
}

/** Camera of the workspace 3D plot as last set by the user; exported 3D figures reuse it. */
export const workspaceSceneCamera = writable<SceneCamera | null>(null)

function isVector(value: unknown): value is SceneCamera['eye'] {
  if (!value || typeof value !== 'object') return false
  const vector = value as Record<string, unknown>
  return ['x', 'y', 'z'].every((axis) => typeof vector[axis] === 'number' && Number.isFinite(vector[axis]))
}

/** Reads a camera from a Plotly relayout payload (`scene.camera` object or dotted sub-keys). */
export function cameraFromRelayout(update: Record<string, unknown>, current: SceneCamera | null): SceneCamera | null {
  const whole = update['scene.camera']
  if (whole && typeof whole === 'object') {
    const camera = whole as Partial<SceneCamera>
    if (isVector(camera.eye)) {
      return {
        eye: { ...camera.eye },
        up: isVector(camera.up) ? { ...camera.up } : current?.up ?? { x: 0, y: 0, z: 1 },
        center: isVector(camera.center) ? { ...camera.center } : current?.center ?? { x: 0, y: 0, z: 0 },
        ...(camera.projection ? { projection: { ...camera.projection } } : current?.projection ? { projection: current.projection } : {}),
      }
    }
  }
  return null
}
