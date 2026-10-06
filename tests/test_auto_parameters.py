"""Run with PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'."""
import unittest

import numpy as np
from scipy.signal import savgol_filter

from peak_detection import estimate_noise, find_spectral_peaks, noise_diagnostics, resolve_settings, suggest_peak_settings
from smoothing_tuning import suggest_savgol

BANDS = ((1740, 9, 40), (1240, 13, 32), (1090, 12, 26), (2950, 14, 18))


def _ir(noise=0.0, seed=0):
    """Percent transmittance with four absorption bands, as an IR import yields."""
    x = np.arange(450, 4001, 2.0)
    clean = 95 - sum(depth * np.exp(-.5 * ((x - center) / width) ** 2) for center, width, depth in BANDS)
    rng = np.random.default_rng(seed)
    return x, clean, clean + rng.normal(0, noise, x.size)


class NoiseEstimateTest(unittest.TestCase):
    def test_correlated_noise_warns_without_changing_estimator(self):
        rng = np.random.default_rng(42)
        white = rng.normal(size=20000)
        correlated = np.convolve(white, np.ones(8) / 8, mode='valid')
        diagnostics = noise_diagnostics(correlated)
        self.assertTrue(diagnostics['correlated'])
        self.assertIn('threshold too low', diagnostics['warning'])
        self.assertAlmostEqual(diagnostics['lagEstimates']['lag1'], estimate_noise(correlated))
        self.assertEqual(suggest_peak_settings(correlated)['noiseDiagnostics'], diagnostics)
        self.assertEqual(suggest_savgol(correlated)['noiseDiagnostics'], diagnostics)

    def test_measured_uv_vis_series_warns(self):
        """JS 603 (SI Section 8.3): lag-1 noise ~6e-5, far below the real scatter."""
        from pathlib import Path
        data = Path(__file__).resolve().parents[1] / 'public/samples/Data_TR_UV_Vis'
        for name in ('JS_603_0min_abs.csv', 'JS_603_120min_abs.csv', 'JS_603_1187min_abs.csv'):
            absorbance = np.loadtxt(data / name, delimiter=';')[:, 1]
            self.assertTrue(noise_diagnostics(absorbance)['correlated'], name)

    def test_white_noise_and_noise_free_bands_do_not_warn(self):
        self.assertFalse(noise_diagnostics(np.random.default_rng(42).normal(size=20000))['correlated'])
        _, clean, _ = _ir()
        self.assertFalse(noise_diagnostics(clean)['correlated'])
        self.assertFalse(noise_diagnostics([1, 2, 3])['correlated'])

    def test_recovers_white_noise_under_bands(self):
        _, _, noisy = _ir(noise=0.8, seed=3)
        self.assertAlmostEqual(estimate_noise(noisy), 0.8, delta=0.08)


class AutoPeakSettingsTest(unittest.TestCase):
    def test_finds_exactly_the_bands_at_several_noise_levels(self):
        for noise in (0.0, 0.3, 1.0, 2.0):
            for seed in range(3):
                x, _, y = _ir(noise, seed)
                indices, _ = find_spectral_peaks(y, {'mode': 'minima', 'auto': True})
                found = sorted(x[indices])
                self.assertEqual(len(found), len(BANDS), (noise, seed, found))
                for center, (expected, *_rest) in zip(found, sorted(BANDS)):
                    self.assertLess(abs(center - expected), 6)

    def test_suggestion_scales_with_noise_and_band_width(self):
        _, _, quiet = _ir(0.2)
        _, _, loud = _ir(2.0)
        low = suggest_peak_settings(quiet, 'minima')
        high = suggest_peak_settings(loud, 'minima')
        self.assertGreater(high['prominence'], low['prominence'])
        # Narrowest band FWHM is 2.355·4.5 points ≈ 10.6; resolvable bands must stay separable.
        self.assertTrue(1 <= low['minDistance'] < 10.6, low)

    def test_manual_settings_are_untouched(self):
        _, _, y = _ir(0.5)
        resolved = resolve_settings(y, {'prominence': 3.0, 'minDistance': 4, 'mode': 'minima'})
        self.assertEqual((resolved['prominence'], resolved['minDistance']), (3.0, 4))


class AutoSavgolTest(unittest.TestCase):
    def test_smooths_noise_and_keeps_band_depth(self):
        _, clean, noisy = _ir(1.0, seed=1)
        suggestion = suggest_savgol(noisy)
        self.assertEqual(suggestion['status'], 'ok')
        smoothed = savgol_filter(noisy, suggestion['windowLength'], suggestion['polyorder'])
        rmse_before = np.sqrt(np.mean((noisy - clean) ** 2))
        rmse_after = np.sqrt(np.mean((smoothed - clean) ** 2))
        self.assertLess(rmse_after, rmse_before / 2)
        # Depth of the narrowest band must stay within 3 % (noise included).
        index = int(np.argmin(np.abs(np.arange(450, 4001, 2.0) - 1740)))
        depth_clean = 95 - clean[index]
        depth_smoothed = 95 - savgol_filter(clean, suggestion['windowLength'], suggestion['polyorder'])[index]
        self.assertLess(abs(depth_smoothed - depth_clean) / depth_clean, 0.03)

    def test_noise_free_and_short_signals(self):
        _, clean, _ = _ir()
        self.assertEqual(suggest_savgol(clean)['status'], 'noise_free')
        self.assertEqual(suggest_savgol([1.0, 2.0, 3.0])['status'], 'too_short')


if __name__ == '__main__':
    unittest.main()



def _uv_normalised(noise, seed=0):
    """Min-max normalised UV-Vis absorbance in % whose noise grows 30x at high absorbance."""
    x = np.arange(180, 1020.5, 0.5)
    y = sum(height * np.exp(-.5 * ((x - center) / width) ** 2)
            for center, width, height in ((260, 20, 60), (420, 30, 25), (600, 35, 40))) + 5
    y = y + np.random.default_rng(seed).normal(0, noise, x.size) * (1 + 30 * ((x - 180) / 840) ** 6)
    return x, np.round((y - y.min()) / np.ptp(y) * 100, 2)


class NormalisedUvAutoTest(unittest.TestCase):
    def test_values_follow_noise_not_the_normalised_span(self):
        _, clean = _uv_normalised(0.0)
        _, noisy = _uv_normalised(0.02)
        quiet = suggest_peak_settings(clean)
        loud = suggest_peak_settings(noisy)
        self.assertLess(quiet['prominence'], 0.1)
        self.assertGreater(loud['prominence'], quiet['prominence'])
        # Half of the ~94-point FWHM of the narrowest band, not of a noise wiggle.
        self.assertGreater(quiet['minDistance'], 30)
        self.assertGreater(loud['minDistance'], 30)

    def test_noise_at_high_absorbance_does_not_add_peaks(self):
        for seed in range(3):
            x, y = _uv_normalised(0.02, seed)
            indices, _ = find_spectral_peaks(y, {'mode': 'maxima', 'auto': True})
            self.assertEqual([round(v / 10) * 10 for v in x[indices]], [260, 420, 600], seed)
