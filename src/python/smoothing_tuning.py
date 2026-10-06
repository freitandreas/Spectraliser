"""Data-driven Savitzky–Golay parameters.

The white-noise level comes from second differences and the narrowest
significant bands bound the window: a window up to 1.0×FWHM (order 2) or
1.8×FWHM (order 4) keeps the height loss of a Gaussian band below ~2 %. Among
the admissible pairs, the one with the strongest noise suppression wins, and
the residual must stay consistent with pure noise, otherwise the window shrinks.
"""
import numpy as np
from scipy.signal import find_peaks, peak_widths, savgol_coeffs, savgol_filter

from peak_detection import estimate_noise, noise_diagnostics

# A band must stand this many noise σ above its surroundings to set the width limit.
MIN_SIGNIFICANCE = 8.0
# Maximum window length per polynomial order, as a multiple of the band FWHM in points.
WIDTH_FACTOR = {2: 1.0, 4: 1.8}
# Spans above this many σ are treated as noise-free.
NOISE_FREE_SNR = 1e4
# Accepted ratio between the residual RMS and the RMS expected from noise alone.
RESIDUAL_TOLERANCE = 1.25


def _odd_floor(value):
    window = int(np.floor(value))
    return window if window % 2 else window - 1


def _noise_gain(window, order):
    # Least-squares smoothing: the white-noise variance factor equals the central coefficient.
    return float(savgol_coeffs(window, order)[window // 2])


def band_fwhm_points(y, noise):
    """FWHM (points) of the narrowest band protruding from the baseline, or None."""
    median = float(np.median(y))
    # Bands protrude away from the baseline, approximated by the median level.
    signal = y if np.max(y) - median >= median - np.min(y) else -y
    threshold = max(MIN_SIGNIFICANCE * noise, 0.02 * float(np.ptp(y)))
    if threshold <= 0:
        return None
    indices, props = find_peaks(signal, prominence=threshold)
    if len(indices) == 0:
        return None
    widths = peak_widths(signal, indices, rel_height=0.5, prominence_data=(
        props['prominences'], props['left_bases'], props['right_bases']))[0]
    # The 8σ significance threshold keeps noise spikes from setting this minimum.
    return float(np.min(widths))


def suggest_savgol(ordinate):
    """Return window length, polynomial order, and the evidence behind them.

    status is 'ok', 'noise_free' (smoothing unnecessary), 'too_narrow' (bands
    too narrow to smooth without distortion), or 'too_short'.
    """
    y = np.asarray(ordinate, dtype=float)
    y = y[np.isfinite(y)]
    result = {'windowLength': 5, 'polyorder': 2, 'noise': 0.0, 'snr': None, 'fwhmPoints': None,
              'noiseDiagnostics': noise_diagnostics(ordinate)}
    if y.size < 7:
        return {**result, 'status': 'too_short'}

    noise = estimate_noise(y)
    span = float(np.ptp(y))
    snr = span / noise if noise > 0 else None
    result.update(noise=noise, snr=snr)
    if snr is None or snr > NOISE_FREE_SNR:
        return {**result, 'status': 'noise_free'}

    fwhm = band_fwhm_points(y, noise)
    result['fwhmPoints'] = fwhm
    limit = y.size if y.size % 2 else y.size - 1
    # Without a resolvable band, smooth over at most 5 % of the points.
    band_limit = fwhm if fwhm else max(7, y.size // 20)
    candidates = []
    for order, factor in WIDTH_FACTOR.items():
        window = _odd_floor(min(band_limit * (factor if fwhm else 1.0), limit))
        if window >= order + 3:
            candidates.append((_noise_gain(window, order), window, order))
    if not candidates:
        return {**result, 'status': 'too_narrow'}

    _, window, order = min(candidates)
    while window >= order + 3:
        residual = y - savgol_filter(y, window, order)
        expected = noise * np.sqrt(1.0 - _noise_gain(window, order))
        if np.sqrt(np.mean(residual ** 2)) <= RESIDUAL_TOLERANCE * expected:
            return {**result, 'windowLength': window, 'polyorder': order, 'status': 'ok'}
        window = min(window - 2, _odd_floor(window * 0.85))
    return {**result, 'status': 'too_narrow'}
