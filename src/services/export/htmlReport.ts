import * as pako from 'pako'
import type { AppState } from '../../types/project'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }

  return btoa(binary)
}

export function generateSelfContainedHtmlReport(state: AppState): string {
  const payload = JSON.stringify(state)
  const compressed = pako.gzip(payload)
  const encoded = toBase64(compressed)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${state.projectName} - SpectraLab Report</title>
    <style>
      body { font-family: 'IBM Plex Sans', sans-serif; margin: 2rem; color: #111827; }
      h1 { margin: 0 0 1rem; }
      pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
      .meta { color: #4b5563; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <h1>${state.projectName}</h1>
    <div class="meta">Generated at ${new Date().toISOString()}</div>
    <h2>Methodology Audit Trail</h2>
    <pre>${state.datasets.map((dataset) => `${dataset.name}: ${dataset.pipeline.map((step) => step.type).join(' -> ')}`).join('\n')}</pre>
    <h2>Generated Script</h2>
    <pre>${state.generatedScript.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <script>
      window.__SPECTRALAB_COMPRESSED_STATE__ = '${encoded}'
    </script>
  </body>
</html>`
}
