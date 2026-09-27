"""Entry point for the editable spectral analysis project.

The app supplies each sample as a DataFrame; standalone execution reads CSV files
listed in SAMPLES. Edit processing.py for transforms and ir_assignments.py for IR.
"""
import json

from processing import process_spectrum
from sample_io import process_all_samples

SAMPLES = json.loads("[]")


def run_standalone():
    return process_all_samples(SAMPLES, process_spectrum)


if __name__ == '__main__':
    results = run_standalone()
    print(f'Processed {len(results)} samples')
