"""Ordered, reproducible spectrum transforms configured in sample metadata."""
import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import spsolve
from scipy.optimize import curve_fit
from scipy.signal import find_peaks, savgol_filter
from peak_detection import noise_diagnostics

ORDER = ('crop', 'baseline', 'smoothing', 'inversion', 'normalization', 'peak_localisation')


def asls_baseline(y, lam=1e5, p=0.01, n_iter=10):
    """Fixed-iteration asymmetric least squares on the sample-index grid."""
    y = np.asarray(y, dtype=float)
    if y.ndim != 1 or y.size < 3 or not np.isfinite(y).all():
        raise ValueError('AsLS needs at least three finite ordinate values.')
    if not np.isfinite(lam) or lam <= 0 or not np.isfinite(p) or not 0 < p < 1:
        raise ValueError('AsLS requires lambda > 0 and 0 < p < 1.')
    if not np.isfinite(n_iter) or int(n_iter) != n_iter or not 1 <= n_iter <= 1000:
        raise ValueError('AsLS iterations must be an integer from 1 to 1000.')
    difference = sparse.diags([1., -2., 1.], [0, 1, 2], shape=(y.size - 2, y.size))
    penalty = lam * (difference.T @ difference)
    weights = np.ones(y.size)
    for _ in range(int(n_iter)):
        baseline = spsolve((sparse.diags(weights) + penalty).tocsc(), weights * y)
        weights = np.where(y > baseline, p, 1 - p)
    if not np.isfinite(baseline).all():
        raise ValueError('AsLS produced a non-finite baseline.')
    return baseline


def reference_window(df, params):
    """Mean immediately before normalisation; reject unstable divisors."""
    center = float(params.get('reference_x', 1182))
    half_width = float(params.get('reference_half_width', 4))
    tolerance = float(params.get('reference_min_abs', 1e-8))
    if not all(np.isfinite([center, half_width, tolerance])) or half_width <= 0 or tolerance < 0:
        raise ValueError('Reference center must be finite; half-width must be positive and tolerance non-negative.')
    x = df['abscissa'].to_numpy(dtype=float)
    y = df['ordinate_modified'].to_numpy(dtype=float)
    window = np.abs(x - center) <= half_width
    if not window.any() or not np.isfinite(y).all():
        raise ValueError('Reference window is empty or the spectrum contains non-finite values.')
    value = float(np.mean(y[window]))
    threshold = max(tolerance, 1e-6 * float(np.max(np.abs(y))))
    if abs(value) <= threshold:
        raise ValueError(f'Reference mean {value:.6g} is near zero (limit {threshold:.6g}); normalisation refused.')
    return {'value': value, 'center': center, 'halfWidth': half_width,
            'pointCount': int(window.sum()), 'minimumAbs': threshold}


def _gaussian(x, amplitude, center, width):
    return amplitude * np.exp(-((x - center) ** 2) / (2.0 * width ** 2))


def _lorentzian(x, amplitude, center, width):
    return amplitude * width ** 2 / ((x - center) ** 2 + width ** 2)


def localise_peaks(df, params):
    """Replace the ordinate with a sum of fitted Gaussian or Lorentzian profiles."""
    x = df['abscissa'].to_numpy(dtype=float)
    y = df['ordinate_modified'].to_numpy(dtype=float)
    if x.size < 4:
        return df

    profile = _lorentzian if str(params.get('model', 'gaussian')).lower() == 'lorentzian' else _gaussian
    prominence = abs(float(params.get('prominence', 0.05) or 0.0))
    indices, _ = find_peaks(y, prominence=prominence) if prominence else find_peaks(y)
    if indices.size == 0:
        return df

    span = float(np.ptp(x)) or 1.0
    seed_width = max(span / x.size * 3.0, span * 1e-3)
    fitted = np.zeros_like(y)

    for index in indices:
        center = x[index]
        amplitude = y[index]
        window = np.abs(x - center) <= seed_width * 6.0
        if int(window.sum()) < 4:
            continue
        guess = [amplitude, center, seed_width]
        try:
            popt, _ = curve_fit(profile, x[window], y[window], p0=guess, maxfev=2000)
        except (RuntimeError, ValueError):
            popt = guess
        fitted += profile(x, *popt)

    df['ordinate_modified'] = fitted
    return df


def _apply_step(df, kind, params, percent=False, diagnostics=None):
    if df.empty:
        if kind == 'normalization' and str(params.get('mode', '')).lower() == 'reference':
            raise ValueError('Reference window is empty; normalisation refused.')
        return df
    if kind == 'crop':
        low = float(params.get('x_min', df['abscissa'].min()))
        high = float(params.get('x_max', df['abscissa'].max()))
        return df.loc[df['abscissa'].between(low, high)].reset_index(drop=True)
    if kind == 'baseline':
        method = str(params.get('method', 'polynomial')).lower()
        if method == 'asls':
            baseline = asls_baseline(df['ordinate_modified'], float(params.get('lam', 1e5)),
                                     float(params.get('p', .01)), float(params.get('n_iter', 10)))
            df['ordinate_modified'] -= baseline
        elif method == 'polynomial':
            order = min(max(1, int(params.get('order', 3))), len(df) - 1)
            if order:
                coefficients = np.polyfit(df['abscissa'], df['ordinate_modified'], deg=order)
                df['ordinate_modified'] -= np.polyval(coefficients, df['abscissa'])
        else:
            raise ValueError(f'Unknown baseline method: {method}')
    elif kind == 'smoothing' and len(df) >= 3:
        length = max(3, int(params.get('window_length', 15)))
        length += length % 2 == 0
        length = min(length, len(df) if len(df) % 2 else len(df) - 1)
        polyorder = min(max(1, int(params.get('polyorder', 2))), length - 1)
        df['ordinate_modified'] = savgol_filter(df['ordinate_modified'], length, polyorder)
    elif kind == 'inversion':
        df['ordinate_modified'] = -df['ordinate_modified']
    elif kind == 'normalization':
        values = df['ordinate_modified'].to_numpy(dtype=float)
        mode = str(params.get('mode', 'minmax')).lower()
        if mode == 'reference':
            reference = reference_window(df, params)
            df['ordinate_modified'] = values / reference['value']
            if diagnostics is not None:
                diagnostics['referenceNormalization'] = reference
        elif mode == 'vector':
            divisor = np.linalg.norm(values)
            df['ordinate_modified'] = values / divisor if divisor else values
        elif mode == 'area':
            divisor = abs(np.trapezoid(np.abs(values), df['abscissa']))
            df['ordinate_modified'] = values / divisor if divisor else values
        elif mode == 'peak':
            divisor = np.max(np.abs(values))
            df['ordinate_modified'] = values / divisor if divisor else values
        elif np.ptp(values):
            df['ordinate_modified'] = (values - values.min()) / np.ptp(values)
        if percent and mode != 'reference':
            df['ordinate_modified'] *= 100
    elif kind == 'peak_localisation':
        df = localise_peaks(df, params)
    return df


def _is_percent(meta):
    unit = str((meta.get('units') or {}).get('y', ''))
    return '%' in unit


def process_spectrum(df: pd.DataFrame, meta: dict | None = None) -> tuple[pd.DataFrame, dict]:
    df = df.copy()
    meta = dict(meta or {})
    diagnostics = {}
    meta['processingDiagnostics'] = diagnostics
    df['ordinate_modified'] = df['ordinate_original']
    order_index = {kind: index for index, kind in enumerate(ORDER)}
    steps = sorted(meta.get('pipeline', []), key=lambda step: (
        order_index.get(str(step.get('type', '')).lower(), len(ORDER)),
        str(step.get('id', '')),
    ))
    for step in steps:
        if step.get('enabled', True):
            params = step.get('params') if isinstance(step.get('params'), dict) else {}
            df = _apply_step(df, str(step.get('type', '')).lower(), params, _is_percent(meta), diagnostics)
    reference = diagnostics.get('referenceNormalization')
    if reference is not None:
        reference.update(xUnit=str((meta.get('units') or {}).get('x', '')),
                         yUnit=str((meta.get('units') or {}).get('y', '')))
    diagnostics['noise'] = noise_diagnostics(df['ordinate_modified'].to_numpy(dtype=float))
    return df, meta
