"""In-app runner: processes only the samples a triggered execution names.

The app never executes main.py. For each run it generates a small entry script
listing the changed sample ids and calls run_samples, which applies the editable
processing.py and ir_assignments.py modules. Only the modified ordinate and the
assigned peaks are returned; the imported abscissa and ordinate are never
replaced. Points removed by a crop step come back as NaN so the result stays
aligned with the measurement.
"""
import numpy as np
import pandas as pd

SOURCE_INDEX = '__spectraliser_source_index'


def _modified_frame(result):
    if isinstance(result, tuple):
        frame = result[0] if result else None
        meta = result[1] if len(result) > 1 and isinstance(result[1], dict) else None
    else:
        frame, meta = result, None
    if frame is None:
        raise ValueError('process_spectrum returned no data')
    if not isinstance(frame, pd.DataFrame):
        frame = pd.DataFrame(frame)
    if 'ordinate_modified' not in frame:
        frame = frame.assign(ordinate_modified=frame['ordinate_original'])
    return frame, meta


def _source_positions(frame, abscissa):
    """Map each processed row back to its position in the imported measurement."""
    size = abscissa.size
    if SOURCE_INDEX in frame:
        positions = frame[SOURCE_INDEX].to_numpy()
        if np.issubdtype(positions.dtype, np.number) and np.all(np.isfinite(positions)):
            positions = positions.astype(int)
            if positions.size and positions.min() >= 0 and positions.max() < size:
                return positions
    if len(frame) == size:
        return np.arange(size)
    if 'abscissa' in frame:
        lookup = {}
        for position, value in enumerate(abscissa.tolist()):
            lookup.setdefault(value, position)
        positions = [lookup.get(value) for value in frame['abscissa'].to_numpy(dtype=float).tolist()]
        if all(position is not None for position in positions):
            return np.asarray(positions, dtype=int)
    raise ValueError(
        'Processed rows could not be matched to the imported data points; '
        'keep the abscissa column or the row order when changing the row count.'
    )


def run_sample(sample, process_spectrum, assign_ir_peaks):
    abscissa = np.asarray(sample['abscissa'], dtype=float)
    ordinate = np.asarray(sample['ordinate'], dtype=float)
    if abscissa.size != ordinate.size:
        raise ValueError('Abscissa and ordinate lengths differ')
    meta = dict(sample.get('metadata') or {})
    source = pd.DataFrame({
        'abscissa': abscissa,
        'ordinate_original': ordinate,
        SOURCE_INDEX: np.arange(abscissa.size),
    })
    frame, output_meta = _modified_frame(process_spectrum(source.copy(), dict(meta)))
    positions = _source_positions(frame, abscissa)

    modified = np.full(abscissa.size, np.nan)
    modified[positions] = frame['ordinate_modified'].to_numpy(dtype=float)

    peaks = []
    analysis_meta = dict(meta)
    analysis_meta.update(output_meta or {})
    if str(analysis_meta.get('spectrumType', '')).lower() == 'ir':
        public = frame.drop(columns=[SOURCE_INDEX], errors='ignore').reset_index(drop=True)
        original = source.drop(columns=[SOURCE_INDEX])
        for peak in assign_ir_peaks(public, analysis_meta, original):
            peak = dict(peak)
            peak['index'] = int(positions[int(peak['index'])])
            peaks.append(peak)
    # An ndarray crosses into JavaScript as one Float64Array copy instead of a list of Python floats.
    return {
        'ordinate_modified': modified,
        'peaks': peaks,
        'processingDiagnostics': (output_meta or {}).get('processingDiagnostics', {}),
    }


def run_samples(sample_ids, samples, process_spectrum, assign_ir_peaks):
    """Run each named sample independently; one failure never blocks the others."""
    by_id = {str(sample['id']): sample for sample in samples}
    results = []
    for sample_id in sample_ids:
        sample = by_id.get(sample_id)
        if sample is None:
            results.append({'id': sample_id, 'error': 'Sample data was not sent to the runner'})
            continue
        try:
            results.append({'id': sample_id, **run_sample(sample, process_spectrum, assign_ir_peaks)})
        except Exception as error:  # noqa: BLE001 - reported per sample to the UI
            results.append({'id': sample_id, 'error': f'{type(error).__name__}: {error}'})
    return results
