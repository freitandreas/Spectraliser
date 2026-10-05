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

Imported samples are processed by the current pipeline, and peaks are then
detected automatically on the processed signal. Detection settings can be
refined per sample in the peak panel.

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
