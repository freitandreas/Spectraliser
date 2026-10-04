import mathJaxUrl from 'mathjax/es5/tex-svg.js?url'

type MathJaxWindow = Window & { MathJax?: { version?: string; startup?: { promise?: Promise<unknown>; typeset?: boolean } } & Record<string, unknown> }

let loading: Promise<void> | null = null

/** Loads the bundled MathJax 3 SVG renderer once, on first use of TeX axis titles. */
export function ensureMathJax(): Promise<void> {
  const target = window as MathJaxWindow
  if (target.MathJax?.version) return Promise.resolve()
  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    target.MathJax = { startup: { typeset: false }, svg: { fontCache: 'none' } }
    const script = document.createElement('script')
    script.src = mathJaxUrl
    script.async = true
    script.onload = () => {
      const ready = (window as MathJaxWindow).MathJax?.startup?.promise
      void Promise.resolve(ready).then(() => resolve(), reject)
    }
    script.onerror = () => {
      loading = null
      reject(new Error('MathJax could not be loaded; fraction axis labels are unavailable.'))
    }
    document.head.appendChild(script)
  })
  return loading
}
