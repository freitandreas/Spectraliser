"""Standalone entry point for the exported spectral analysis project.

Running this file reads the CSV files listed in samples.json (generated next to
this file from the sample settings) and processes every sample. The app does not
run main.py: each execution generates a runner that sends only the changed
samples through processing.py and ir_assignments.py. Edit those modules to change
the transforms or the IR assignment; both paths use them.
"""
import json
from pathlib import Path

from processing import process_spectrum
from sample_io import process_all_samples


PROJECT_DIR = Path(__file__).resolve().parent


def load_samples():
    with open(PROJECT_DIR / 'samples.json', encoding='utf-8') as handle:
        return json.load(handle)


SAMPLES = load_samples()


def run_standalone():
    return process_all_samples(SAMPLES, process_spectrum, PROJECT_DIR)


if __name__ == '__main__':
    results = run_standalone()
    print(f'Processed {len(results)} samples')
