import math
import unittest

import numpy as np
import pandas as pd

from ir_assignments import assign_ir_peaks
from peak_detection import find_spectral_peaks
from processing import process_spectrum
from selective_run import run_samples


def sample(sample_id, pipeline, spectrum_type='uv-vis', x=None, y=None):
    x = list(range(10)) if x is None else x
    y = [float(v) for v in range(10)] if y is None else y
    return {
        'id': sample_id,
        'abscissa': x,
        'ordinate': y,
        'metadata': {
            'spectrumType': spectrum_type,
            'units': {'x': 'nm', 'y': ''},
            'pipeline': pipeline,
            'peakDetection': {'prominence': 0.01, 'minDistance': 1, 'minHeight': None, 'mode': 'maxima'},
        },
    }


CROP = {'id': 'c', 'type': 'crop', 'scope': 'individual', 'enabled': True, 'params': {'x_min': 3, 'x_max': 6}}
INVERT = {'id': 'i', 'type': 'inversion', 'scope': 'individual', 'enabled': True, 'params': {}}


class SelectiveRunTests(unittest.TestCase):
    def test_reference_diagnostics_cross_runner_without_replacing_measurements(self):
        step = {'id': 'ref', 'type': 'normalization', 'enabled': True,
                'params': {'mode': 'reference', 'reference_x': 4, 'reference_half_width': 1}}
        source = sample('a', [step])
        result = run_samples(['a'], [source], process_spectrum, assign_ir_peaks)[0]
        self.assertEqual(result['processingDiagnostics']['referenceNormalization']['value'], 4)
        self.assertEqual(result['processingDiagnostics']['referenceNormalization']['xUnit'], 'nm')
        self.assertNotIn('abscissa', result)
        self.assertNotIn('ordinate_original', result)

    def test_runs_only_requested_samples(self):
        samples = [sample('a', [INVERT]), sample('b', [INVERT])]
        results = run_samples(['b'], samples, process_spectrum, assign_ir_peaks)
        self.assertEqual([result['id'] for result in results], ['b'])
        self.assertEqual(results[0]['ordinate_modified'][:3].tolist(), [-0.0, -1.0, -2.0])

    def test_crop_keeps_length_with_nan_outside_window_and_does_not_touch_inputs(self):
        source = sample('a', [CROP, INVERT])
        before = list(source['ordinate'])
        result = run_samples(['a'], [source], process_spectrum, assign_ir_peaks)[0]
        values = result['ordinate_modified'].tolist()
        self.assertEqual(len(values), 10)
        self.assertTrue(all(math.isnan(v) for v in values[:3] + values[7:]))
        self.assertEqual(values[3:7], [-3.0, -4.0, -5.0, -6.0])
        self.assertEqual(source['ordinate'], before)

    def test_reports_errors_per_sample(self):
        def broken(df, meta):
            if meta['spectrumType'] == 'raman':
                raise ValueError('boom')
            return process_spectrum(df, meta)

        samples = [sample('ok', []), sample('bad', [], 'raman'), sample('mismatch', [], y=[1.0])]
        results = run_samples(['ok', 'bad', 'mismatch', 'missing'], samples, broken, assign_ir_peaks)
        self.assertIn('ordinate_modified', results[0])
        self.assertEqual(results[1]['error'], 'ValueError: boom')
        self.assertIn('lengths differ', results[2]['error'])
        self.assertIn('not sent', results[3]['error'])

    def test_matches_rows_by_abscissa_when_the_index_column_is_dropped(self):
        def custom(df, meta):
            kept = df.loc[df['abscissa'] >= 5, ['abscissa', 'ordinate_original']].reset_index(drop=True)
            return kept.assign(ordinate_modified=kept['ordinate_original'] * 2), meta

        result = run_samples(['a'], [sample('a', [])], custom, assign_ir_peaks)[0]
        self.assertTrue(math.isnan(result['ordinate_modified'][4]))
        self.assertEqual(result['ordinate_modified'][5:].tolist(), [10.0, 12.0, 14.0, 16.0, 18.0])

    def test_rejects_rows_that_cannot_be_matched(self):
        def custom(df, meta):
            return pd.DataFrame({'ordinate_modified': [1.0, 2.0]}), meta

        result = run_samples(['a'], [sample('a', [])], custom, assign_ir_peaks)[0]
        self.assertIn('could not be matched', result['error'])

    def test_ir_peak_indices_refer_to_the_full_measurement_after_crop(self):
        x = np.linspace(4000, 400, 400)
        y = np.exp(-((x - 1715) / 12) ** 2) + np.exp(-((x - 2950) / 15) ** 2) * 0.5
        crop = {**CROP, 'params': {'x_min': 1000, 'x_max': 3200}}
        source = sample('a', [crop], 'ir', x.tolist(), y.tolist())
        source['metadata']['units'] = {'x': 'cm⁻¹', 'y': 'Absorbance'}
        result = run_samples(['a'], [source], process_spectrum, assign_ir_peaks)[0]
        self.assertTrue(math.isnan(result['ordinate_modified'][0]))
        self.assertTrue(result['peaks'])
        for peak in result['peaks']:
            self.assertAlmostEqual(x[peak['index']], peak['x'])

    def test_peak_detection_ignores_nan_gaps(self):
        y = np.array([np.nan, np.nan, 0.0, 1.0, 0.0, 2.0, 0.0, np.nan])
        indices, prominences = find_spectral_peaks(y, {'prominence': 0.1})
        self.assertEqual(indices.tolist(), [3, 5])
        self.assertTrue(np.all(np.isfinite(prominences)))


if __name__ == '__main__':
    unittest.main()
