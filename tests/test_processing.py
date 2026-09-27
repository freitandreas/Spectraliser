"""Run with PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'."""
import unittest

import numpy as np
import pandas as pd

from processing import process_spectrum


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


if __name__ == '__main__':
    unittest.main()
