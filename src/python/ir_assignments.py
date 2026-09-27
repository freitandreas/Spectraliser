"""Detect IR absorptions and propose functional-group assignments.

Assignments combine band position, prominence (weak/medium/strong), width,
and diagnostic band patterns. A primary amine needs two distinct narrow N–H
bands; an ester needs its carbonyl plus two distinct C–O absorptions. Labels
are hypotheses; overlapping bands cannot uniquely identify a molecule.
"""
import numpy as np
from scipy.signal import peak_widths

from ir_reference import BANDS, LOW_SPECIFICITY, MIN_BANDS
from peak_detection import detection_signal, find_spectral_peaks, normalize_settings


def _is_wavenumber(meta, x):
    unit = str((meta.get('units') or {}).get('x', '')).lower().replace(' ', '').replace('^', '')
    unit = unit.replace('−', '-').replace('⁻', '-').replace('¹', '1')
    if unit:
        # An explicit wavenumber unit is authoritative; far-IR axes may start below 350.
        return 'cm-1' in unit or '1/cm' in unit or 'wavenumber' in unit
    quantity = str((meta.get('units') or {}).get('xQuantity', '')).lower()
    if 'wavenumber' in quantity:
        return True
    return len(x) > 3 and np.nanmin(x) >= 200 and np.nanmax(x) <= 5000


def _peak_settings(meta):
    settings = meta.get('peakDetection')
    if settings:
        return settings
    return {'mode': meta.get('peakDetectionMode', 'maxima')}


def _detect(df, meta):
    x = np.asarray(df['abscissa'], dtype=float)
    y = np.asarray(df['ordinate_modified'], dtype=float)
    if len(x) < 5 or not _is_wavenumber(meta, x):
        return []

    settings = _peak_settings(meta)
    # Identical call to the one the worker uses, so both agree on peak indices.
    indices, prominences = find_spectral_peaks(y, settings)
    if len(indices) == 0:
        return []

    signal = detection_signal(y, normalize_settings(settings)['mode'])
    widths = peak_widths(signal, indices, rel_height=0.5)
    max_prominence = max(float(np.max(prominences)), 1e-12)
    positions = np.arange(len(x))
    peaks = []
    for pos, index in enumerate(indices):
        width = abs(float(np.interp(widths[3][pos], positions, x)
                          - np.interp(widths[2][pos], positions, x)))
        relative = float(prominences[pos] / max_prominence)
        intensity = 'weak' if relative < .13 else 'medium' if relative < .42 else 'strong'
        peaks.append({
            'index': int(index),
            'x': float(x[index]),
            'y': float(y[index]),
            'prominence': float(prominences[pos]),
            'intensity': intensity,
            'width': width,
        })
    return peaks


def _match_band(peaks, band, used):
    _, low, high, strength = band
    center = (low + high) / 2
    candidates = []
    for index, peak in enumerate(peaks):
        if index in used or not low <= peak['x'] <= high:
            continue
        position = 1 - abs(peak['x'] - center) / max((high - low) / 2, 1)
        strength_rank = {'weak': 0, 'medium': 1, 'strong': 2}
        difference = abs(strength_rank[peak['intensity']] - strength_rank[strength])
        score = .55 + .25 * position - .10 * difference
        if band[0].startswith('O–H') and peak['width'] >= 70:
            score += .22
        if 'N–H' in band[0] and peak['width'] >= 90:
            score -= .22
        candidates.append((score, index))
    return max(candidates, default=None)


def _match_groups(peaks):
    matches = []
    for group, bands in BANDS.items():
        used = set()
        assignments = []
        # Carbonyl and characteristic bands are chosen before overlapping C–O windows.
        for band in bands:
            hit = _match_band(peaks, band, used)
            if hit is not None and hit[0] >= .34:
                assignments.append((hit[1], band[0], hit[0]))
                used.add(hit[1])
        if len(assignments) < MIN_BANDS.get(group, len(bands)):
            continue
        if group == 'Primary amine':
            nh = [peaks[i] for i, name, _ in assignments if name.startswith('N–H')]
            if len(nh) < 2 or abs(nh[0]['x'] - nh[1]['x']) < 35 or any(
                peak['width'] >= 90 for peak in nh
            ):
                continue
        if group == 'Acid anhydride':
            carbonyls = [peaks[i] for i, name, _ in assignments if 'C=O' in name]
            if len(carbonyls) < 2 or abs(carbonyls[0]['x'] - carbonyls[1]['x']) < 25:
                continue
        if group == 'Carboxylic acid':
            oh = next((peaks[i] for i, name, _ in assignments if name == 'O–H'), None)
            if oh is None or oh['width'] < 110:
                continue
        # Multi-band matches outrank isolated fingerprint coincidences.
        score = sum(hit_score for _, _, hit_score in assignments) / len(assignments)
        score += .17 * (len(assignments) - 1)
        if group == 'Ester' and len(assignments) == 3:
            score += .18
        if group in LOW_SPECIFICITY:
            score -= .24
        matches.append((score, group, assignments))
    return sorted(matches, reverse=True)


def _generic_assignment(peak):
    x = peak['x']
    if 1650 <= x <= 1850:
        return 'C=O region (ambiguous)'
    if 3200 <= x <= 3650:
        return 'O–H / N–H region (ambiguous)'
    if 2100 <= x <= 2300:
        return 'Triple-bond region (ambiguous)'
    if 2800 <= x <= 3150:
        return 'C–H stretch (ambiguous)'
    if 400 <= x <= 1500:
        return 'Fingerprint region (ambiguous)'
    return 'Unassigned'


def assign_ir_peaks(df, meta, original=None):
    """Return table-ready peaks for IR data (empty for other spectrum types).

    The index always refers to the processed DataFrame. Original data is kept
    in the signature for custom extensions and standalone compatibility.
    """
    if str(meta.get('spectrumType', '')).lower() != 'ir':
        return []
    peaks = _detect(df, meta)
    groups = _match_groups(peaks)
    for index, peak in enumerate(peaks):
        options = [(score, group, role) for score, group, assignments in groups
                   for band_index, role, _ in assignments if band_index == index]
        options.sort(reverse=True)
        if options:
            score, group, role = options[0]
            if score < .72:
                peak['label'] = _generic_assignment(peak)
                peak['confidence'] = 'low'
                peak['alternatives'] = list(dict.fromkeys(name for _, name, _ in options[:4]))
                del peak['width']
                continue
            confidence = 'high' if score >= 1.05 and len(options) < 3 else 'medium'
            if score < .72 or (len(options) > 1 and options[1][0] > score - .08):
                confidence = 'low'
            peak['label'] = f'{group} · {role}'
            peak['confidence'] = confidence
            peak['alternatives'] = list(dict.fromkeys(
                name for _, name, _ in options[1:4] if name != group
            ))
        else:
            peak['label'] = _generic_assignment(peak)
            peak['confidence'] = 'low'
            peak['alternatives'] = []
        del peak['width']
    return peaks
