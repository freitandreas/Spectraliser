import type { SpectrumDataset } from '../../types/project'

interface PythonAstModule {
  imports: string[]
  body: string[]
}

function toJsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function buildAst(datasets: SpectrumDataset[]): PythonAstModule {
  const imports = [
    'import json',
    'import numpy as np',
    'import pandas as pd',
    'import scipy.signal as signal',
  ]

  const samplesMeta = datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    sourcePath: dataset.sourcePath,
    spectrumType: dataset.spectrumType,
    units: dataset.units,
    style: dataset.style,
    pipeline: dataset.pipeline,
  }))

  const samplesJson = toJsonLiteral(samplesMeta)

  const body: string[] = [
    '',
    'SAMPLES = json.loads(r"""',
    samplesJson,
    '""")',
    '',
    '# In the web app, process_spectrum(df, meta) is called with injected sample df/meta.',
    '# As standalone Python, run_standalone() loops over SAMPLES and loads each sourcePath.',
    '',
    'def process_spectrum(df: pd.DataFrame, meta: dict | None = None) -> tuple[pd.DataFrame, dict]:',
    "    df = df.copy()",
    '    meta = dict(meta or {})',
    '    pipeline = list(meta.get("pipeline", []))',
    "    df['ordinate_modified'] = df['ordinate_original']",
    '',
    '    ordered_types = ["crop", "baseline", "smoothing", "inversion", "normalization", "derivative"]',
    '    type_index = {name: idx for idx, name in enumerate(ordered_types)}',
    '    pipeline = sorted(',
    '        pipeline,',
    '        key=lambda step: (',
    '            type_index.get(str(step.get("type", "")), 999),',
    '            str(step.get("id", "")),',
    '        ),',
    '    )',
    '',
    '    for step in pipeline:',
    '        if not bool(step.get("enabled", True)):',
    '            continue',
    '        transform_type = str(step.get("type", "")).lower()',
    '        params = step.get("params", {}) if isinstance(step.get("params", {}), dict) else {}',
    '',
    '        if transform_type == "crop":',
    '            x_min = float(params.get("x_min", float(np.min(df["abscissa"]))))',
    '            x_max = float(params.get("x_max", float(np.max(df["abscissa"]))))',
    '            mask = (df["abscissa"] >= x_min) & (df["abscissa"] <= x_max)',
    '            df = df.loc[mask].reset_index(drop=True)',
    '            continue',
    '',
    '        if transform_type == "baseline":',
    '            order = max(1, int(round(float(params.get("order", 3)))))',
    '            coeff = np.polyfit(df["abscissa"], df["ordinate_modified"], deg=order)',
    '            baseline = np.polyval(coeff, df["abscissa"])',
    '            df["ordinate_modified"] = df["ordinate_modified"] - baseline',
    '            continue',
    '',
    '        if transform_type == "smoothing":',
    '            window_length = max(3, int(round(float(params.get("window_length", 15)))))',
    '            if window_length % 2 == 0:',
    '                window_length += 1',
    '            sample_count = int(len(df["ordinate_modified"]))',
    '            if sample_count >= 3:',
    '                max_window = sample_count if sample_count % 2 == 1 else sample_count - 1',
    '                window_length = min(window_length, max_window)',
    '                polyorder = max(1, int(round(float(params.get("polyorder", 2)))))',
    '                polyorder = min(polyorder, window_length - 1)',
    '                if window_length > polyorder:',
    '                    df["ordinate_modified"] = signal.savgol_filter(',
    '                        df["ordinate_modified"],',
    '                        window_length=window_length,',
    '                        polyorder=polyorder,',
    '                    )',
    '            continue',
    '',
    '        if transform_type == "inversion":',
    '            df["ordinate_modified"] = -1.0 * df["ordinate_modified"]',
    '            continue',
    '',
    '        if transform_type == "normalization":',
    '            mode = str(params.get("mode", "minmax")).lower()',
    '            if mode == "vector":',
    '                norm = np.linalg.norm(df["ordinate_modified"])',
    '                if norm != 0:',
    '                    df["ordinate_modified"] = df["ordinate_modified"] / norm',
    '                continue',
    '            if mode == "area":',
    '                area = np.trapezoid(np.abs(df["ordinate_modified"]), df["abscissa"])',
    '                if area != 0:',
    '                    df["ordinate_modified"] = df["ordinate_modified"] / area',
    '                continue',
    '            if mode == "peak":',
    '                peak = np.max(np.abs(df["ordinate_modified"]))',
    '                if peak != 0:',
    '                    df["ordinate_modified"] = df["ordinate_modified"] / peak',
    '                continue',
    '            y_min = df["ordinate_modified"].min()',
    '            y_max = df["ordinate_modified"].max()',
    '            if y_max != y_min:',
    '                df["ordinate_modified"] = (df["ordinate_modified"] - y_min) / (y_max - y_min)',
    '            continue',
    '',
    '        if transform_type == "derivative":',
    '            order = max(1, int(round(float(params.get("order", 1)))))',
    '            for _ in range(order):',
    '                df["ordinate_modified"] = np.gradient(df["ordinate_modified"])',
    '            continue',
  ]

  body.push('    return df, meta', '')
  body.push('def _load_sample_dataframe(meta: dict) -> pd.DataFrame:')
  body.push('    frame = pd.read_csv(meta["sourcePath"])')
  body.push('    numeric = frame.select_dtypes(include=[np.number])')
  body.push('    if numeric.shape[1] < 2:')
  body.push('        raise ValueError(f"Sample {meta.get(\'name\', \'unknown\')} has fewer than 2 numeric columns")')
  body.push('    x_col = numeric.columns[0]')
  body.push('    y_col = numeric.columns[1]')
  body.push('    return pd.DataFrame({')
  body.push("        'abscissa': numeric[x_col].to_numpy(),")
  body.push("        'ordinate_original': numeric[y_col].to_numpy(),")
  body.push('    })', '')

  body.push('def process_all_samples(samples: list[dict] | None = None) -> list[dict]:')
  body.push('    samples = list(samples if samples is not None else SAMPLES)')
  body.push('    results: list[dict] = []')
  body.push('    for sample_meta in samples:')
  body.push('        df = _load_sample_dataframe(sample_meta)')
  body.push('        out_df, out_meta = process_spectrum(df, sample_meta)')
  body.push('        results.append({')
  body.push("            'meta': out_meta,")
  body.push("            'abscissa': out_df['abscissa'].tolist(),")
  body.push("            'ordinate_original': out_df['ordinate_original'].tolist(),")
  body.push("            'ordinate_modified': out_df['ordinate_modified'].tolist(),")
  body.push('        })')
  body.push('    return results', '')

  body.push('def run_standalone() -> list[dict]:')
  body.push('    return process_all_samples(SAMPLES)', '')

  body.push('if __name__ == "__main__":')
  body.push('    print(f"Processing {len(SAMPLES)} samples...")')
  body.push('    output = run_standalone()')
  body.push('    print(f"Processed {len(output)} samples")')
  body.push('')

  return { imports, body }
}

export function generatePythonScript(datasets: SpectrumDataset[]): string {
  const ast = buildAst(datasets)
  return [...ast.imports, ...ast.body].join('\n')
}
