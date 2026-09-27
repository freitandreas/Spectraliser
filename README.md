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
