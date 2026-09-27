"""Single source of truth for spectral peak picking.

The interactive worker detection and the editable IR script both call
find_spectral_peaks, so the peak table and the Python run can never disagree
about which points are peaks.
"""
import numpy as np
from scipy.signal import find_peaks, peak_prominences

DEFAULT_MODE = 'maxima'


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
    }


def detection_signal(ordinate, mode=DEFAULT_MODE):
    """Return the signal find_peaks runs on; minima are detected on -y."""
    values = np.asarray(ordinate, dtype=float)
    return -values if str(mode).lower() == 'minima' else values


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
    options = normalize_settings(settings)
    signal = detection_signal(ordinate, options['mode'])
    indices, properties = find_peaks(signal, **find_peaks_kwargs(settings))

    prominences = properties.get('prominences')
    if prominences is None:
        # find_peaks only reports prominences when a prominence filter is set.
        prominences = peak_prominences(signal, indices)[0] if len(indices) else np.zeros(0)

    return np.asarray(indices, dtype=int), np.asarray(prominences, dtype=float)
