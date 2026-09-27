"""Run with PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'."""
import unittest

import numpy as np
import pandas as pd

from ir_assignments import assign_ir_peaks


class IRAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.x = np.arange(450, 4001, 2)

    def assign(self, bands, *, y_unit='Absorbance', x_unit='cm-1', spectrum_type='ir', mode=None):
        signal = sum(strength * np.exp(-.5 * ((self.x - center) / width) ** 2)
                     for center, width, strength in bands)
        if y_unit == 'Transmittance %':
            signal = 100 - 30 * signal
            # Transmittance bands are dips, so the same minima mode the worker uses applies.
            mode = mode or 'minima'
        frame = pd.DataFrame({
            'abscissa': self.x[::-1],
            'ordinate_original': signal[::-1],
            'ordinate_modified': signal[::-1],
        })
        return assign_ir_peaks(frame, {
            'spectrumType': spectrum_type,
            'units': {'x': x_unit, 'y': y_unit},
            'peakDetection': {'mode': mode or 'maxima'},
        })

    def test_ester_uses_carbonyl_and_two_co_bands(self):
        bands = [(1740, 9, 1), (1240, 13, .8), (1090, 12, .65)]
        for y_unit in ('Absorbance', 'Transmittance %'):
            peaks = self.assign(bands, y_unit=y_unit)
            self.assertEqual(len(peaks), 3)
            self.assertTrue(all(peak['label'].startswith('Ester') for peak in peaks))
            self.assertEqual({peak['intensity'] for peak in peaks}, {'strong'})

    def test_primary_amine_requires_two_distinct_nh_bands(self):
        two = self.assign([(3460, 10, .8), (3340, 10, .65), (1600, 18, .25)])
        self.assertEqual(sum('Primary amine' in peak['label'] for peak in two), 3)
        one = self.assign([(3400, 10, .8)])
        self.assertFalse(any('Primary amine' in peak['label'] for peak in one))

    def test_broad_acid_oh_needs_carbonyl(self):
        peaks = self.assign([(1710, 11, 1), (2900, 200, .5)])
        self.assertTrue(any('Carboxylic acid' in peak['label'] for peak in peaks))

    def test_non_ir_and_non_wavenumber_are_not_assigned(self):
        bands = [(1740, 10, 1)]
        self.assertEqual(self.assign(bands, spectrum_type='raman'), [])
        self.assertEqual(self.assign(bands, x_unit='nm'), [])

    def test_far_ir_axes_below_350_are_still_assigned(self):
        x = np.arange(200, 4001, 2)
        signal = sum(strength * np.exp(-.5 * ((x - center) / width) ** 2)
                     for center, width, strength in ((1740, 9, 1), (1240, 13, .8), (1090, 12, .65)))
        frame = pd.DataFrame({
            'abscissa': x[::-1],
            'ordinate_original': signal[::-1],
            'ordinate_modified': signal[::-1],
        })
        peaks = assign_ir_peaks(frame, {
            'spectrumType': 'ir',
            'units': {'x': 'cm⁻¹', 'y': 'Absorbance'},
            'peakDetection': {'mode': 'maxima'},
        })
        self.assertEqual(len(peaks), 3)
        self.assertTrue(all(peak['label'].startswith('Ester') for peak in peaks))

    def test_unicode_wavenumber_unit_is_recognised(self):
        peaks = self.assign([(1740, 9, 1), (1240, 13, .8), (1090, 12, .65)], x_unit='cm⁻¹')
        self.assertEqual(len(peaks), 3)

    def test_minima_mode_detects_absorbance_dips(self):
        signal = 1 - sum(strength * np.exp(-.5 * ((self.x - center) / width) ** 2)
                          for center, width, strength in (
                              (1740, 9, .8), (1240, 13, .65), (1090, 12, .55),
                          ))
        frame = pd.DataFrame({
            'abscissa': self.x[::-1],
            'ordinate_original': signal[::-1],
            'ordinate_modified': signal[::-1],
        })

        peaks = assign_ir_peaks(frame, {
            'spectrumType': 'ir',
            'peakDetectionMode': 'minima',
            'units': {'x': 'cm-1', 'y': 'Absorbance'},
        })

        self.assertEqual(len(peaks), 3)
        self.assertTrue(all(peak['y'] < 1 for peak in peaks))


if __name__ == '__main__':
    unittest.main()
