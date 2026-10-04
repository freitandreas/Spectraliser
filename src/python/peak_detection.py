"""Single source of truth for spectral peak picking.

The interactive worker detection and the editable IR script both call
find_spectral_peaks, so the peak table and the Python run can never disagree
about which points are peaks. With ``auto`` enabled, prominence and minimum
distance are derived from the signal itself (see suggest_peak_settings).
"""
import numpy as np
from scipy.signal import find_peaks, peak_prominences, peak_widths

DEFAULT_MODE = 'maxima'
# Relative floor for automatic prominence: values below a millionth of the span are
# numerical jitter even on noise-free data.
AUTO_SPAN_FLOOR = 1e-6
# Half-width (in points) of the window used for the local noise check of each peak.
LOCAL_NOISE_HALF_WIDTH = 50


def _coerce_float(value):
    # Pyodide can expose JavaScript null as a JsNull proxy rather than None.
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def normalize_settings(settings=None):
    """Return detection settings in the exact form used by find_peaks."""
    settings = dict(settings or {})

    prominence = _coerce_float(settings.get('prominence'))
    min_distance = _coerce_float(settings.get('minDistance'))
    min_height = _coerce_float(settings.get('minHeight'))

    mode = str(settings.get('mode', DEFAULT_MODE)).lower()
    if mode not in ('maxima', 'minima'):
        mode = DEFAULT_MODE

    return {
        'prominence': abs(prominence) if prominence else 0.0,
        'minDistance': max(0, int(min_distance)) if min_distance else 0,
        'minHeight': None if min_height is None else abs(min_height),
        'mode': mode,
        'auto': settings.get('auto') is True,
        # Set by automatic resolution: drop peaks that do not exceed their local noise range.
        'localNoise': settings.get('localNoise') is True,
    }


def estimate_noise(values):
    """Robust white-noise standard deviation from second differences.

    For white noise var(Δ²ε) = 6σ²; the MAD keeps smooth band curvature from
    inflating the estimate.
    """
    y = np.asarray(values, dtype=float)
    y = y[np.isfinite(y)]
    if y.size < 5:
        return 0.0
    d2 = np.diff(y, 2)
    mad = np.median(np.abs(d2 - np.median(d2)))
    return float(1.4826 * mad / np.sqrt(6.0))


def _significant(value):
    return float(f'{value:.3g}') if value > 0 else 0.0


def _noise_range(noise, size):
    """Range 2 σ √(2 ln n) that n points of pure white noise are not expected to exceed."""
    return 2.0 * noise * np.sqrt(2.0 * np.log(max(size, 2)))


def _quantisation_step(values):
    """Smallest non-zero step between neighbouring values (digitiser or rounding resolution)."""
    steps = np.abs(np.diff(values))
    steps = steps[steps > AUTO_SPAN_FLOOR * max(float(np.ptp(values)), 1e-300)]
    return float(np.min(steps)) if steps.size else 0.0


def local_noise(values, index, half_width=LOCAL_NOISE_HALF_WIDTH):
    """Noise level around one point; UV-Vis noise grows strongly at high absorbance."""
    start = max(0, index - half_width)
    return estimate_noise(values[start:index + half_width + 1])


def suggest_peak_settings(ordinate, mode=DEFAULT_MODE):
    """Derive prominence and minimum distance from the data alone.

    prominence = max(2 σ √(2 ln n), 2 × quantisation step), the range white noise of n
    points (σ from second differences) and digitisation steps are not expected to exceed.
    minDistance is half of the median FWHM (in points) of the more prominent half of the
    bands passing that threshold and the local noise check, so narrow noise wiggles do not
    set it; it stays 1 when no band is found.
    """
    signal = detection_signal(ordinate, mode)
    finite = np.asarray(ordinate, dtype=float)
    finite = finite[np.isfinite(finite)]
    if finite.size < 3:
        return {'prominence': 0.0, 'minDistance': 1, 'noise': 0.0, 'fwhmPoints': None}
    noise = estimate_noise(finite)
    floor = max(2.0 * _quantisation_step(finite), AUTO_SPAN_FLOOR * float(np.ptp(finite)))
    prominence = _significant(max(_noise_range(noise, finite.size), floor))
    fwhm = None
    if prominence > 0:
        indices, props = find_peaks(signal, prominence=prominence)
        keep = _locally_significant(signal, indices, props['prominences'])
        indices = indices[keep]
        if len(indices):
            prominences = props['prominences'][keep]
            widths = peak_widths(signal, indices, rel_height=0.5, prominence_data=(
                prominences, props['left_bases'][keep], props['right_bases'][keep]))[0]
            strong = widths[prominences >= np.median(prominences)]
            fwhm = float(np.median(strong))
    min_distance = max(1, int(round(0.5 * fwhm))) if fwhm else 1
    return {'prominence': prominence, 'minDistance': min_distance, 'noise': noise, 'fwhmPoints': fwhm}


def _locally_significant(signal, indices, prominences):
    """Mask of peaks whose prominence also exceeds the noise range around them."""
    size = int(np.isfinite(signal).sum())
    return np.asarray([
        prominence > _noise_range(local_noise(signal, int(index)), size)
        for index, prominence in zip(indices, prominences)
    ], dtype=bool)


def resolve_settings(ordinate, settings=None):
    """Return the settings detection actually uses, resolving automatic values."""
    options = normalize_settings(settings)
    if options['auto']:
        suggestion = suggest_peak_settings(ordinate, options['mode'])
        options['prominence'] = suggestion['prominence']
        options['minDistance'] = suggestion['minDistance']
        options['localNoise'] = True
        # The values are concrete now; resolving again must not re-estimate them.
        options['auto'] = False
    return options


def detection_signal(ordinate, mode=DEFAULT_MODE):
    """Return the signal find_peaks runs on; minima are detected on -y."""
    values = np.asarray(ordinate, dtype=float)
    signal = -values if str(mode).lower() == 'minima' else values
    gaps = ~np.isfinite(signal)
    if gaps.any() and not gaps.all():
        # Points removed by a crop are NaN; the floor value can never be a peak.
        signal = np.where(gaps, np.min(signal[~gaps]), signal)
    return signal


def find_peaks_kwargs(settings=None):
    options = normalize_settings(settings)
    kwargs = {}
    if options['prominence'] > 0:
        kwargs['prominence'] = options['prominence']
    if options['minDistance'] > 0:
        kwargs['distance'] = options['minDistance']
    if options['minHeight'] is not None:
        kwargs['height'] = options['minHeight']
    return kwargs


def find_spectral_peaks(ordinate, settings=None):
    """Return (indices, prominences) for one ordinate array."""
    options = resolve_settings(ordinate, settings)
    signal = detection_signal(ordinate, options['mode'])
    indices, properties = find_peaks(signal, **find_peaks_kwargs(options))

    prominences = properties.get('prominences')
    if prominences is None:
        # find_peaks only reports prominences when a prominence filter is set.
        prominences = peak_prominences(signal, indices)[0] if len(indices) else np.zeros(0)
    indices = np.asarray(indices, dtype=int)
    prominences = np.asarray(prominences, dtype=float)
    if options['localNoise'] and len(indices):
        keep = _locally_significant(signal, indices, prominences)
        indices, prominences = indices[keep], prominences[keep]
    return indices, prominences
