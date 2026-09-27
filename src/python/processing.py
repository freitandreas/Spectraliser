"""Ordered, reproducible spectrum transforms configured in sample metadata."""
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit
from scipy.signal import find_peaks, savgol_filter

ORDER = ('crop', 'baseline', 'smoothing', 'inversion', 'normalization', 'peak_localisation')


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


def _apply_step(df, kind, params, percent=False):
    if df.empty:
        return df
    if kind == 'crop':
        low = float(params.get('x_min', df['abscissa'].min()))
        high = float(params.get('x_max', df['abscissa'].max()))
        return df.loc[df['abscissa'].between(low, high)].reset_index(drop=True)
    if kind == 'baseline':
        order = min(max(1, int(params.get('order', 3))), len(df) - 1)
        if order:
            coefficients = np.polyfit(df['abscissa'], df['ordinate_modified'], deg=order)
            df['ordinate_modified'] -= np.polyval(coefficients, df['abscissa'])
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
        if mode == 'vector':
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
        if percent:
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
    df['ordinate_modified'] = df['ordinate_original']
    order_index = {kind: index for index, kind in enumerate(ORDER)}
    steps = sorted(meta.get('pipeline', []), key=lambda step: (
        order_index.get(str(step.get('type', '')).lower(), len(ORDER)),
        str(step.get('id', '')),
    ))
    for step in steps:
        if step.get('enabled', True):
            params = step.get('params') if isinstance(step.get('params'), dict) else {}
            df = _apply_step(df, str(step.get('type', '')).lower(), params, _is_percent(meta))
    return df, meta
