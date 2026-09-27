import type { WorkerRequest, WorkerResponse } from './messages'
import { logInfo, logWarn, logError, state, ensurePyodideReady, toFloatArray, maybeUpgradePrecision } from './runtimeCore'

export async function executeScript(
  request: Extract<WorkerRequest, { type: 'execute_script' }>,
): Promise<WorkerResponse> {
  const startTime = performance.now()
  logInfo(`Executing user script for request ID: ${request.requestId} (Spectrum: ${request.spectrumId})`)

  if (state.canceledRequests.has(request.requestId)) {
    logWarn(`Script request ${request.requestId} was pre-canceled before execution.`)
    return {
      type: 'cancelled',
      requestId: request.requestId,
    }
  }

  const pyodide = await ensurePyodideReady()

  const xArray = toFloatArray(request.abscissa, request.preferFloat32)
  const yArray = toFloatArray(request.ordinate, request.preferFloat32)
  const promoted = maybeUpgradePrecision(yArray)

  // Pyodide has one virtual filesystem. Write the editable modules before each run
  // and drop their cached imports so changes in the sidebar take effect immediately.
  const directory = '/tmp/spectraliser_scripts'
  pyodide.FS.mkdirTree(directory)
  for (const [name, source] of Object.entries(request.scriptFiles ?? {})) {
    if (/^[a-z_]+\.py$/.test(name)) pyodide.FS.writeFile(`${directory}/${name}`, source)
  }

  logInfo(`Script input size: ${xArray.length} data points. Metadata keys: ${Object.keys(request.metadata || {}).join(', ')}`)

  const globals = pyodide.toPy({
    abscissa: Array.from(xArray),
    ordinate_original: Array.from(promoted.values),
    metadata: request.metadata,
  })

  const scriptBody = [
    'import inspect',
    'import sys',
    'import importlib',
    'import pandas as pd',
    'import numpy as np',
    'import scipy.signal as signal',
    '',
    'df = pd.DataFrame({',
    "    'abscissa': abscissa,",
    "    'ordinate_original': ordinate_original,",
    '})',
    '',
    'meta = dict(metadata)',
    "sys.path.insert(0, '/tmp/spectraliser_scripts') if '/tmp/spectraliser_scripts' not in sys.path else None",
    "for _module_name in ('processing', 'sample_io', 'ir_assignments', 'ir_reference'):",
    '    sys.modules.pop(_module_name, None)',
    'importlib.invalidate_caches()',
    'sys.dont_write_bytecode = True',
    "__name__ = 'spectraliser_editor'",
    '',
    request.scriptCode,
    '',
    "if 'process_spectrum' in globals() and callable(process_spectrum):",
    '    signature = inspect.signature(process_spectrum)',
    '    param_count = len(signature.parameters)',
    '    if param_count >= 2:',
    '        result = process_spectrum(df.copy(), dict(meta))',
    '    else:',
    '        result = process_spectrum(df.copy())',
    'else:',
    '    result = df.copy()',
    '',
    'out_df = df.copy()',
    'out_meta = dict(meta)',
    '',
    'if isinstance(result, tuple):',
    '    if len(result) > 0 and result[0] is not None:',
    '        out_df = result[0]',
    '    if len(result) > 1 and isinstance(result[1], dict):',
    '        out_meta = result[1]',
    'elif isinstance(result, dict):',
    "    candidate_df = result.get('df')",
    "    candidate_meta = result.get('meta')",
    '    if candidate_df is not None:',
    '        out_df = candidate_df',
    '    if isinstance(candidate_meta, dict):',
    '        out_meta = candidate_meta',
    'elif result is not None:',
    '    out_df = result',
    '',
    'if not isinstance(out_df, pd.DataFrame):',
    '    out_df = pd.DataFrame(out_df)',
    '',
    'if not isinstance(out_meta, dict):',
    '    out_meta = dict(meta)',
    '',
    "meta_units = out_meta.get('units', {}) if isinstance(out_meta.get('units', {}), dict) else {}",
    "meta_style = out_meta.get('style', {}) if isinstance(out_meta.get('style', {}), dict) else {}",
    '',
    'out_meta = {',
    "    'name': str(out_meta.get('name', meta.get('name', ''))),",
    "    'sourcePath': str(out_meta.get('sourcePath', meta.get('sourcePath', ''))),",
    "    'spectrumType': str(out_meta.get('spectrumType', meta.get('spectrumType', 'uv-vis'))),",
    "    'units': {",
    "        'x': str(meta_units.get('x', meta.get('units', {}).get('x', ''))),",
    "        'y': str(meta_units.get('y', meta.get('units', {}).get('y', ''))),",
    '    },',
    "    'style': {",
    "        'label': str(meta_style.get('label', meta.get('style', {}).get('label', ''))),",
    "        'lineColor': str(meta_style.get('lineColor', meta.get('style', {}).get('lineColor', '#4fc1ff'))),",
    "        'lineWidth': float(meta_style.get('lineWidth', meta.get('style', {}).get('lineWidth', 2.0))),",
    "        'scatterSymbol': str(meta_style.get('scatterSymbol', meta.get('style', {}).get('scatterSymbol', 'circle'))),",
    "        'visible': bool(meta_style.get('visible', meta.get('style', {}).get('visible', True))),",
    '    },',
    '}',
    '',
    "if 'abscissa' not in out_df.columns:",
    "    out_df['abscissa'] = df['abscissa']",
    '',
    "if 'ordinate_original' not in out_df.columns:",
    "    out_df['ordinate_original'] = df['ordinate_original']",
    '',
    "if 'ordinate_modified' not in out_df.columns:",
    "    out_df['ordinate_modified'] = out_df['ordinate_original']",
    '',
    'out_peak_assignments = []',
    ...(request.scriptFiles ? [
      "if out_meta['spectrumType'].lower() == 'ir':",
      '    from ir_assignments import assign_ir_peaks',
      '    analysis_meta = dict(meta)',
      '    analysis_meta.update(out_meta)',
      '    out_peak_assignments = assign_ir_peaks(out_df, analysis_meta, df)',
      '',
    ] : []),
    "out_abscissa = out_df['abscissa'].tolist()",
    "out_original = out_df['ordinate_original'].tolist()",
    "out = out_df['ordinate_modified'].tolist()",
  ].join('\n')

  try {
    pyodide.setStdout({
      batched: (text) => logInfo(`[Python stdout]: ${text}`),
    })
    pyodide.setStderr({
      batched: (text) => logWarn(`[Python stderr]: ${text}`),
    })

    logInfo('Checking user script for non-standard imported packages...')
    await pyodide.loadPackagesFromImports(scriptBody)

    logInfo('Executing script body in Pyodide...')
    const pyStart = performance.now()
    await pyodide.runPythonAsync(scriptBody, { globals, locals: globals })
    logInfo(`Script Python execution finished in ${(performance.now() - pyStart).toFixed(2)}ms.`)

    const abscissaProxy = globals.get('out_abscissa')
    const abscissa = abscissaProxy.toJs() as number[]
    abscissaProxy.destroy()

    const originalProxy = globals.get('out_original')
    const ordinateOriginal = originalProxy.toJs() as number[]
    originalProxy.destroy()

    const outProxy = globals.get('out')
    const ordinateModified = outProxy.toJs() as number[]
    outProxy.destroy()

    const metadataProxy = globals.get('out_meta')
    const metadata = metadataProxy.toJs({ dict_converter: Object.fromEntries }) as {
      name?: string
      sourcePath?: string
      spectrumType?: string
      units?: { x: string; y: string }
      style?: {
        label: string
        lineColor: string
        lineWidth: number
        scatterSymbol: string
        visible?: boolean
      }
    }
    metadataProxy.destroy()

    const peaksProxy = globals.get('out_peak_assignments')
    const peaks = peaksProxy.toJs({ dict_converter: Object.fromEntries }) as
      Extract<WorkerResponse, { type: 'result' }>['peaks']
    peaksProxy.destroy()

    if (state.canceledRequests.has(request.requestId)) {
      logWarn(`Script request ${request.requestId} was canceled after Python execution completed.`)
      state.canceledRequests.delete(request.requestId)
      return {
        type: 'cancelled',
        requestId: request.requestId,
      }
    }

    logInfo(`Script request ${request.requestId} completed successfully in ${(performance.now() - startTime).toFixed(2)}ms.`)

    return {
      type: 'result',
      requestId: request.requestId,
      spectrumId: request.spectrumId,
      abscissa,
      ordinateOriginal,
      ordinateModified,
      metadata,
      peaks,
      precision: promoted.precision,
    }
  } catch (error) {
    logError(`Error executing script request ${request.requestId}:`, error)
    throw error
  } finally {
    globals.destroy()
  }
}
