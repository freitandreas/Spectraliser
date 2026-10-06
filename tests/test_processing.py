"""Run with PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'."""
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from processing import asls_baseline, process_spectrum


def _frame():
    x = np.linspace(400, 800, 64)
    y = np.exp(-.5 * ((x - 600) / 40) ** 2)
    return pd.DataFrame({'abscissa': x, 'ordinate_original': y, 'ordinate_modified': y})


def _meta(y_unit):
    return {
        'units': {'x': 'nm', 'y': y_unit},
        'pipeline': [{
            'id': 'normalize-1', 'type': 'normalization',
            'scope': 'individual', 'enabled': True, 'params': {'mode': 'minmax'},
        }],
    }


class PercentOrdinateTests(unittest.TestCase):
    def test_normalised_data_is_dimensionless_by_default(self):
        processed, _ = process_spectrum(_frame(), _meta(''))
        self.assertAlmostEqual(float(processed['ordinate_modified'].max()), 1.0)

    def test_percent_unit_scales_normalised_data_to_100(self):
        processed, _ = process_spectrum(_frame(), _meta('%'))
        self.assertAlmostEqual(float(processed['ordinate_modified'].max()), 100.0)
        self.assertAlmostEqual(float(processed['ordinate_modified'].min()), 0.0)

    def test_percent_scaling_only_applies_to_normalised_output(self):
        meta = _meta('%')
        meta['pipeline'][0]['enabled'] = False
        processed, _ = process_spectrum(_frame(), meta)
        self.assertLessEqual(float(processed['ordinate_modified'].max()), 1.0)


class BaselineAndReferenceTests(unittest.TestCase):
    def test_reference_refuses_when_crop_removes_all_points(self):
        meta = {'pipeline': [
            {'id': 'crop', 'type': 'crop', 'enabled': True, 'params': {'x_min': 1000, 'x_max': 1200}},
            {'id': 'norm', 'type': 'normalization', 'enabled': True, 'params': {'mode': 'reference'}},
        ]}
        with self.assertRaisesRegex(ValueError, 'Reference window is empty'):
            process_spectrum(_frame(), meta)

    def process(self, frame, kind, params, unit=''):
        return process_spectrum(frame, {'units': {'y': unit}, 'pipeline': [
            {'id': 'test', 'type': kind, 'enabled': True, 'params': params},
        ]})

    def test_asls_matches_pybaselines_on_ae509(self):
        from pybaselines import Baseline
        source = Path(__file__).resolve().parents[1] / 'public/samples/AE-509-2.csv'
        y = pd.read_csv(source).iloc[:, 1].to_numpy(dtype=float)
        expected, _ = Baseline().asls(y, lam=1e5, p=.01, diff_order=2, max_iter=9, tol=-1)
        actual = asls_baseline(y)
        np.testing.assert_allclose(actual, expected, rtol=1e-7, atol=1e-9)

    def test_asls_preserves_original_and_is_deterministic(self):
        frame = _frame()
        frame['ordinate_original'] += np.linspace(1, 2, len(frame))
        before = frame.copy(deep=True)
        result, _ = self.process(frame, 'baseline', {'method': 'asls'})
        repeat, _ = self.process(frame, 'baseline', {'method': 'asls'})
        pd.testing.assert_frame_equal(frame, before)
        np.testing.assert_array_equal(result['ordinate_original'], before['ordinate_original'])
        np.testing.assert_array_equal(result['ordinate_modified'], repeat['ordinate_modified'])

    def test_asls_rejects_invalid_inputs(self):
        for params in ({'lam': 0}, {'p': 0}, {'p': 1}, {'n_iter': 0}, {'n_iter': 1.5}):
            with self.assertRaises(ValueError):
                asls_baseline(np.ones(8), **params)
        with self.assertRaises(ValueError):
            asls_baseline([1, np.nan, 2])
        with self.assertRaises(ValueError):
            asls_baseline([1, 2])

    def test_reference_window_reports_mean_and_preserves_raw(self):
        frame = pd.DataFrame({'abscissa': [1186, 1184, 1182, 1180, 1178, 1176],
                              'ordinate_original': [2., 4., 6., 8., 10., 30.]})
        result, meta = self.process(frame, 'normalization', {'mode': 'reference'}, unit='%')
        self.assertEqual(meta['processingDiagnostics']['referenceNormalization']['value'], 6)
        self.assertEqual(meta['processingDiagnostics']['referenceNormalization']['pointCount'], 5)
        np.testing.assert_allclose(result['ordinate_modified'], frame['ordinate_original'] / 6)
        np.testing.assert_array_equal(result['ordinate_original'], frame['ordinate_original'])

    def test_reference_rejects_empty_and_near_zero_windows(self):
        for params in ({'reference_x': 1182}, {'reference_x': 600, 'reference_half_width': 0}):
            with self.assertRaises(ValueError):
                self.process(_frame(), 'normalization', {'mode': 'reference', **params})
        frame = pd.DataFrame({'abscissa': [1180, 1182, 1184, 1300],
                              'ordinate_original': [-1e-10, 0., 1e-10, 1.]})
        with self.assertRaisesRegex(ValueError, 'near zero'):
            self.process(frame, 'normalization', {'mode': 'reference'})


if __name__ == '__main__':
    unittest.main()
