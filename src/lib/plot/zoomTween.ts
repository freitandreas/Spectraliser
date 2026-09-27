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

  cancel(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }
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
      const step = (now: number): void => {
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

        this.frameHandle = null
        resolve()
      }

      this.frameHandle = requestAnimationFrame(step)
    })
  }
}
