"""Run with PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'."""
import unittest

import numpy as np
import pandas as pd
from scipy.signal import find_peaks

from ir_assignments import _detect
from peak_detection import find_spectral_peaks, normalize_settings


def _spectrum(inverted=False):
    x = np.arange(450, 4001, 2)
    signal = sum(strength * np.exp(-.5 * ((x - center) / width) ** 2)
                 for center, width, strength in (
                     (1740, 9, 1), (1240, 13, .8), (1090, 12, .65), (2950, 14, .45),
                 ))
    return x, (1 - signal if inverted else signal)


class PeakDetectionParityTests(unittest.TestCase):
    """The worker and the IR script must never disagree about peak positions."""

    def worker_indices(self, y, settings):
        # Mirrors exactly what src/worker/peakRuntime.ts executes.
        indices, _ = find_spectral_peaks(y, settings)
        return indices.tolist()

    def script_indices(self, x, y, settings):
        frame = pd.DataFrame({
            'abscissa': x,
            'ordinate_original': y,
            'ordinate_modified': y,
        })
        peaks = _detect(frame, {
            'spectrumType': 'ir',
            'units': {'x': 'cm-1', 'y': 'Absorbance'},
            'peakDetection': settings,
        })
        return [peak['index'] for peak in peaks]

    def assert_parity(self, settings, inverted=False):
        x, y = _spectrum(inverted=inverted)
        worker = self.worker_indices(y, settings)
        script = self.script_indices(x, y, settings)
        self.assertEqual(worker, script)
        self.assertGreater(len(worker), 0)

    def test_maxima_parity_for_default_settings(self):
        self.assert_parity({'prominence': 0.01, 'minDistance': 1, 'minHeight': None, 'mode': 'maxima'})

    def test_minima_parity(self):
        self.assert_parity(
            {'prominence': 0.01, 'minDistance': 1, 'minHeight': None, 'mode': 'minima'},
            inverted=True,
        )

    def test_parity_with_min_height_and_distance(self):
        self.assert_parity({'prominence': 0.05, 'minDistance': 5, 'minHeight': 0.2, 'mode': 'maxima'})

    def test_parity_without_prominence(self):
        self.assert_parity({'prominence': 0, 'minDistance': 0, 'minHeight': None, 'mode': 'maxima'})

    def test_prominences_are_reported_without_a_prominence_filter(self):
        _, y = _spectrum()
        _, prominences = find_spectral_peaks(y, {'prominence': 0, 'mode': 'maxima'})
        self.assertTrue(all(value > 0 for value in prominences))

    def test_negative_prominence_matches_positive_magnitude(self):
        _, y = _spectrum()
        negative = self.worker_indices(y, {'prominence': -0.05, 'minDistance': 1, 'mode': 'maxima'})
        positive = self.worker_indices(y, {'prominence': 0.05, 'minDistance': 1, 'mode': 'maxima'})
        self.assertEqual(negative, positive)

    def test_minima_are_detected_on_the_inverted_signal(self):
        _, y = _spectrum(inverted=True)
        settings = {'prominence': 0.01, 'minDistance': 1, 'mode': 'minima'}
        expected, _ = find_peaks(-np.asarray(y, dtype=float), prominence=0.01, distance=1)
        self.assertEqual(self.worker_indices(y, settings), expected.tolist())


class PeakSettingsNormalizationTests(unittest.TestCase):
    class JsNull:
        """Stands in for the Pyodide proxy that float() cannot convert."""

        def __float__(self):
            raise TypeError('JsNull is not a real number')

    def test_js_null_min_height_is_treated_as_unset(self):
        self.assertIsNone(normalize_settings({'minHeight': self.JsNull()})['minHeight'])

    def test_unknown_mode_falls_back_to_maxima(self):
        self.assertEqual(normalize_settings({'mode': 'inflection'})['mode'], 'maxima')

    def test_missing_settings_produce_no_thresholds(self):
        options = normalize_settings(None)
        self.assertEqual(options['prominence'], 0.0)
        self.assertEqual(options['minDistance'], 0)
        self.assertIsNone(options['minHeight'])


if __name__ == '__main__':
    unittest.main()
