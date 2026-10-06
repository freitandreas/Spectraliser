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
python3 -m pip install numpy pandas scipy pybaselines
PYTHONPATH=src/python python3 -m unittest discover -s tests -p 'test_*.py'
```

`pybaselines` is a test-only reference dependency, not a browser runtime dependency.

## Processing validation

The baseline step offers **Polynomial** and **AsLS** (SciPy sparse asymmetric
least squares). AsLS uses a second-difference penalty on the sample-index grid
and a fixed iteration count; lambda therefore depends on sampling density.
Defaults are lambda = 100000, p = 0.01 and 10 iterations. Use p near 1 for
downward bands rather than upward bands. Invalid parameters and non-finite
data are refused. Original measurements are never replaced by these transforms.

The first AE-509-2 series (1176 points) was compared with `pybaselines` 1.2.1
using `Baseline().asls(lam=1e5, p=0.01, diff_order=2, max_iter=9, tol=-1)`.
The negative tolerance disables early stopping, and `max_iter=9` gives ten
linear solves, matching our fixed ten iterations. The maximum absolute
baseline difference was 1.32e-13. The regression test compares every point
with `rtol=1e-7, atol=1e-9`.

**Reference window** normalisation divides by the arithmetic mean immediately
before the normalisation step, using the reference center and half-width in
the sample's current abscissa units (default 1182 +/- 4, suitable for cm^-1).
The output is a dimensionless ratio even when the input is in percent. An empty
window, non-finite data, or a mean at or below the larger of the absolute
minimum (default 1e-8) and 1e-6 times the maximum absolute signal is refused.
The sample and all-samples processing views show each last-run reference mean,
window, units and point count, so reference-band changes remain inspectable.

Noise diagnostics compare MAD-based second-difference estimates at sample
lags 1, 2 and 4 without changing the existing estimator or automatic thresholds.
For at least 64 finite points, a warning appears if the lag-1 estimate exceeds
1e-6 of the signal span, lag 2 exceeds 1.3 times lag 1, and lag 4 exceeds
1.6 times lag 1. The warning is a heuristic: correlated noise
or unresolved signal curvature may make the automatic peak threshold too low.
It appears in peak settings and automatic smoothing advice. Seeded correlated
synthetic noise triggers it; white noise and noise-free IR bands do not.

The JS_603_0min import regression compares all 1675 CSV rows against the
instrument's original binary float32 data: wavelengths match exactly and
absorbances differ by at most 5.1e-11 (CSV rounding). A numeric first row is
retained even with the header checkbox enabled. This fixes the previous
loss of the 182.5 nm point and its use as a series label. Previously saved
imports cannot recover that omitted row automatically; reimport their source.

## Guided tour

Choose **Take a tour** during setup or **About/Help** in the toolbar to open
the guided walkthrough. It explains import, sample management, plotting,
data and metadata, shared settings, heatmaps, processing, peaks, Python and
export using five deterministic synthetic UV-Vis series with time and
concentration metadata. The demo curves and manually marked bands are
illustrative, not experimental measurements or detection results.

Use **Next** and **Back** to navigate. **Finish**, **Exit tour**, or **Escape**
restores the original project, scripts, preferences and workspace layout.
The demo is read-only, automatic script execution is paused, and demo data
are never autosaved. Starting a tour during analysis reports that you must
wait for the analysis to finish. The tour can be repeated without adding
samples to the project.

## Experiment metadata

The spectrum import wizard detects comma, semicolon, tab or pipe delimiters
when it opens, using consistent column counts and numeric rows. Comma decimal
separators are also recognised in non-comma-delimited files. Detection uses the
first file; the chosen format applies to the whole batch and remains editable.

Each sample's **Data** tab has a metadata box next to the data table. Add
fields there as *Time* (number or `HH:MM:SS` with a unit), *Concentration*
(molar or mass units) or a custom name with value and unit. Time,
concentration or any numeric custom field can be chosen as the third axis of
heatmap and 3D plots in General settings → Appearance; time and concentration
are converted into the chosen axis unit, and series without a usable value are
placed by their order with a notice. Only measured series are plotted: heatmaps
shade bilinearly between neighbouring series and the 3D surface mesh joins
them, so no synthetic spectra are generated. 3D axis titles keep symbols and
subscripts; because WebGL cannot typeset TeX, the fraction label style is drawn
as quantity over a rule over the unit. Rows that are peaks are flagged ⚑ in the
data table.

Use **Data → Metadata** to import an experiment table from CSV. Choose
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

## Export

Choose **Export** to open export settings in the right panel and a live preview
in the bottom panel. Figure width and height are set in centimetres; presets
cover a 16:9 presentation slide (25.4 × 14.29 cm), a single paper column
(8.5 × 5.7 cm) and a full paper width (17.8 × 11.9 cm). The figure is laid out
at its physical size, so the chosen font size in pt matches the slide or
document. The preview scales the whole figure to the available space without
cropping, and PNG exports render it at the selected resolution. 3D plots use
the camera orientation and zoom last set in the workspace plot.
Closing export restores the previous bottom-panel height and workspace.
Exported plots draw every series equally, without the selection or hover
highlighting of the workspace plot. **Show peaks of all series** adds the
detected peaks of every exported series.

Reports (PDF, HTML, LaTeX) contain the plot followed by a **Measurement and
processing** section listing the spectrum type, sample count and axes shared by
all samples, the general pipeline settings and the peak detection parameters.
A section for each sample then lists its metadata, the processing steps whose
settings differ from the general pipeline (omitted when there are none), and
its table of enabled peaks. **Peak table columns** selects the visible columns
(default: position, ordinate, IR intensity and assignment; prominence, FWHM and
area are optional). Each peak table caption states the detection parameters
used and how many peaks were added or removed manually.
The table exports contain the same tables: LaTeX (`booktabs`, `tabularx`,
`adjustbox`, `caption`) or an Excel workbook that also includes the spectral data.

Plot rendering, report preparation and peak detection on import run after the
interface has updated: a loading overlay covers the plot or export preview
until it can be used, and the progress bar in the header shows the running work.

Other outputs are a Python project ZIP with source data, a CSV summary and a
JSON project snapshot. The PDF opens the browser's print dialog, where the
destination can be set to “Save to PDF”. The LaTeX report ZIP contains
`report.tex` and `plot.png` and compiles with XeLaTeX/LuaLaTeX (`fontspec`).

The Python ZIP includes `README.md` and `requirements.txt`, with commands for
creating and running a local virtual environment on Linux, macOS and Windows.
It does not bundle a machine-specific environment or install packages automatically.
Running `main.py` processes the source measurements and then opens `plot.html`
in the default browser. This Plotly figure is a snapshot of the processed data
at export time, preserving the current overlay/heatmap/3D mode, plot styling,
visible series, metadata axes and 3D camera. Python/CSV edits do not update the
saved figure; re-export from the app to refresh it.

Imported samples are processed by the current pipeline, and peaks are then
detected automatically on the processed signal. Detection settings can be
refined per sample in the peak panel.

## Editable Python files

The Script tab has a scrollable file list on the left and one editor on the right.
`main.py` reads the sample metadata from `samples.json`, `processing.py` applies the ordered
transforms, `sample_io.py` loads CSVs for standalone Python, `ir_assignments.py`
detects and assigns IR peaks, and `ir_reference.py` holds the band catalog.
Changes to each file are saved with the project. **Execute** loads all current
files into the worker, reloads edited modules and processes the selected samples.
**Revert To GUI State** clears edits to all Python files and rebuilds `main.py`
from the current sample metadata. The other modules return to their defaults.

For standalone Python, extract the Python export ZIP and follow its README.
The sample metadata references the included CSVs via project-relative `dataFile`
paths, so the project can be moved without changing the original `sourcePath`.

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
