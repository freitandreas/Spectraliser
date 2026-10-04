"""CSV loading and standalone result serialization."""
from pathlib import Path

import numpy as np
import pandas as pd


def sample_data_path(meta, base_dir=None):
    """Exported projects store the measurement in dataFile; older ones only have sourcePath."""
    path = Path(meta.get('dataFile') or meta['sourcePath'])
    if base_dir is not None and not path.is_absolute():
        path = Path(base_dir) / path
    return path


def load_sample_dataframe(meta, base_dir=None):
    frame = pd.read_csv(sample_data_path(meta, base_dir))
    numeric = frame.select_dtypes(include=[np.number])
    if numeric.shape[1] < 2:
        raise ValueError(f"Sample {meta.get('name', 'unknown')} needs two numeric columns")
    return pd.DataFrame({
        'abscissa': numeric.iloc[:, 0].to_numpy(),
        'ordinate_original': numeric.iloc[:, 1].to_numpy(),
    })


def process_all_samples(samples, processor, base_dir=None):
    from ir_assignments import assign_ir_peaks

    results = []
    for meta in samples:
        original = load_sample_dataframe(meta, base_dir)
        processed, output_meta = processor(original, meta)
        if not isinstance(processed, pd.DataFrame):
            processed = pd.DataFrame(processed)
        if 'ordinate_modified' not in processed:
            processed['ordinate_modified'] = processed['ordinate_original']
        peaks = assign_ir_peaks(processed, output_meta, original) if (
            str(output_meta.get('spectrumType', '')).lower() == 'ir'
        ) else []
        results.append({
            'meta': output_meta,
            'abscissa': processed['abscissa'].tolist(),
            'ordinate_original': processed['ordinate_original'].tolist(),
            'ordinate_modified': processed['ordinate_modified'].tolist(),
            'peaks': peaks,
        })
    return results
