type RelayoutFn = (target: HTMLDivElement, update: Record<string, unknown>) => Promise<unknown> | undefined

const DURATION_MS = 520

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

/** Plotly.animate does not interpolate axis ranges reliably, so ranges are tweened frame by frame. */
export class AxisRangeTween {
  private frameHandle: number | null = null
  private finishCurrent: (() => void) | null = null

  cancel(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }
    const finish = this.finishCurrent
    this.finishCurrent = null
    finish?.()
  }

  run(
    container: HTMLDivElement,
    relayout: RelayoutFn,
    from: [number, number],
    to: [number, number],
  ): Promise<void> {
    this.cancel()
    const startTime = performance.now()

    return new Promise((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        this.frameHandle = null
        this.finishCurrent = null
        resolve()
      }
      this.finishCurrent = finish

      const step = (now: number): void => {
        if (settled) return
        const progress = Math.min(1, (now - startTime) / DURATION_MS)
        const eased = easeInOutCubic(progress)

        void relayout(container, {
          'xaxis.range': [
            from[0] + (to[0] - from[0]) * eased,
            from[1] + (to[1] - from[1]) * eased,
          ],
        })

        if (progress < 1) {
          this.frameHandle = requestAnimationFrame(step)
          return
        }

        finish()
      }

      this.frameHandle = requestAnimationFrame(step)
    })
  }
}
