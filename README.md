# Spectraliser

An in-browser spectrum workbench with editable Python processing powered by Pyodide.

## Start

```sh
npm ci
npm run dev
```

Use **Check**, **Test** and **Build** with `npm run check`, `npm test` and `npm run build`.
Run the scientific rule tests with:

```sh
PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'
```

## Experiment metadata

Each sample's **Data** tab has a metadata box next to the data table. Add
fields there as *Time* (number or `HH:MM:SS` with a unit), *Concentration*
(molar or mass units) or a custom name with value and unit. Time,
concentration or any numeric custom field can be chosen as the third axis of
heatmap and 3D plots in General settings → Appearance; time and concentration
are converted into the chosen axis unit, and series without a usable value are
placed by their order with a notice. Rows that are peaks are flagged ⚑ in the
data table.

Use **Metadata** in the toolbar to import an experiment table from CSV. Choose
the table delimiter, the dataset field to match, and the corresponding key
column. Matches are exact and case-sensitive; duplicate keys in the table,
missing keys, unmatched keys, and non-unique dataset keys are reported and
prevent partial imports. Rows may cover only some datasets; uncovered datasets
remain without linked metadata. Each non-key column becomes a dataset metadata
field, blank cells are stored as `null`, and a later import updates matching
field names while preserving other metadata already linked to that dataset.

For a file containing multiple spectral series, match on the series label (the
individual label visible in the data table), not the shared file name or source
path. Dataset IDs are shown in each dataset's metadata box and can also be used
when preparing an ID-keyed table. Linked fields are displayed below the
numerical data table and are saved with the project/autosave.

## Editable Python files

The Script tab has a scrollable file list on the left and one editor on the right.
`main.py` embeds the sample metadata, `processing.py` applies the ordered
transforms, `sample_io.py` loads CSVs for standalone Python, `ir_assignments.py`
detects and assigns IR peaks, and `ir_reference.py` holds the band catalog.
Changes to each file are saved with the project. **Execute** loads all current
files into the worker, reloads edited modules and processes the selected samples.
**Revert To GUI State** clears edits to all Python files and rebuilds `main.py`
from the current sample metadata. The other modules return to their defaults.

In standalone Python, put the modules in the same directory and run `main.py`.
The `sourcePath` values in its sample metadata must point to readable CSV files.

## IR peak assignments

Set the spectrum type to **IR** and the X unit to wavenumbers (`cm-1`,
`cm^-1`, `cm⁻¹`, `1/cm` or `wavenumber`). The Y unit should say **Absorbance**
or **Transmittance**; `%T` is also accepted. With an empty X unit, a plausible
350–5000 cm⁻¹ axis is assumed. Execute the script to populate the peak table.
The algorithm detects maxima in absorbance or minima in transmittance, computes
relative prominence and width, and scores functional-group candidates using
their expected ranges, intensity and nearby companion bands. For instance,
a primary amine needs two distinct narrow N–H stretches; an ester needs its
carbonyl and two C–O bands. The table shows intensity and confidence, while
hovering the label shows alternatives. Manually edited labels are kept on rerun.

The reference covers common organic, organosulfur, organophosphorus and
organosilicon groups, plus halides. No finite frequency table can identify
every possible group or prove a molecular structure from IR alone. Overlapping
bands, mixtures, weak absorptions and truncated spectra remain ambiguous. A
generic region label and low confidence are used when the data are insufficient.
The band windows are based on the [NIST correlation charts](https://www.nist.gov/publications/middle-range-infrared-absorption-correlation-charts)
and are intended as screening suggestions; compare against measured standards
such as the [NIST Chemistry WebBook](https://webbook.nist.gov/chemistry/).
