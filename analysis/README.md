# Report analyses

Scripts that produce Figures 7 and 8 and the numbers in Section 4 of the internship report from
Spectraliser Python exports. They are not part of the web app and are not deployed.

| Script | Report | Input | Output (in `figures/`) |
| --- | --- | --- | --- |
| `ir_reanalysis.py` | Section 4.1, Figure 7 | `sessions/ir/` | `ir_carbonyl_reanalysis.pdf`, `ir_asls_corrected_per_step.csv`, `ir_linear_decomposition.csv` |
| `uvvis_figure.py` | Section 4.2, Figure 8 | `sessions/uvvis/` | `uvvis_raw_absorbance.pdf` |

`ir_reanalysis.py` imports AsLS and the reference window from `../src/python/processing.py`, so the
results always correspond to the processing code of the same checkout.

## 1. Create the exports

Use the app built from the commit you cite in the report.

**IR (AE-509).** Import `public/samples/AE-509-2.csv` with all 82 columns. Set the y quantity to
Absorbance. Do not delete or reorder spectra: the script relies on the acquisition order (it checks
the `hh:mm:ss` labels and stops if they are not increasing). Optionally set the AE-509 pipeline
(baseline AsLS, lambda = 1e5, p = 0.01; normalisation by reference window at 1182 +/- 4 cm-1) so the
session documents the processing; the scripts read the original data either way.
Export -> Python project, then extract the ZIP so that `samples.json` lies directly in
`analysis/sessions/ir/`.

**UV/Vis (SI Section 8.3).** Import the 13 files `public/samples/Data_TR_UV_Vis/JS_603_<t>min_abs.csv`
(not the `_trans` or `.dat` files). Export -> Python project and extract into
`analysis/sessions/uvvis/`. The script checks that exactly the times 0, 1, 3, 5, 10, 20, 30, 60,
90, 120, 190, 240 and 1187 min are present.

## 2. Run

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install numpy pandas scipy matplotlib
python analysis/ir_reanalysis.py
python analysis/uvvis_figure.py
```

Both scripts accept `--session DIR` and `--out DIR` to use other locations. The figures use
Latin Modern Roman if it is installed (it ships with most TeX distributions) and fall back to
DejaVu Serif otherwise. Copy the two PDFs next to the report's `.tex` file.

## 3. Check against the report

`ir_reanalysis.py` prints the dilution steps, the 3.0-fold decrease of the 1182 cm-1 reference over
the 10-fold dilution and the concentration-independent shares (1916 cm-1: 0.10, 1945: 0.56,
1965: 0.50, 1625: 0.45, 1635: 0.52). `uvvis_figure.py` prints A(370 nm, 0 min) = 1.300, the
single-wavelength traces and the crossing points with the 0 min spectrum (370.4 -> 339.5 nm).
If any of these change after a new export, update the report text.
