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
Absorbance and leave the y unit empty: changing the unit to % rescales the stored data, including 
the original ordinate, by 100. Do not delete or reorder spectra: the script relies on the acquisition 
order (it checks the `hh:mm:ss` labels and stops if they are not increasing). Optionally set the AE-509 
pipeline (baseline AsLS, lambda = 1e5, p = 0.01; normalisation by reference window at 1182 +/- 1 cm-1,
i.e. the single point at 1182 cm-1 as in the AE-509 scripts) so the session documents the processing; 
the scripts read the original data either way.
Export -> Python project and put the ZIP into `analysis/sessions/ir/` (extracting it there, or
into one subfolder, also works).

**UV/Vis (SI Section 8.3).** Import the 13 files `public/samples/Data_TR_UV_Vis/JS_603_<t>min_abs.csv`
(not the `_trans` or `.dat` files). Export -> Python project and put the ZIP (or its extracted
contents) into `analysis/sessions/uvvis/`. The script checks that exactly the times 0, 1, 3, 5, 10, 20, 30, 60,
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

Both scripts accept `--session` (folder or `.zip`) and `--out` to use other locations. If no
export is found, they say where they looked. The figures use
Latin Modern Roman if it is installed (it ships with most TeX distributions) and fall back to
DejaVu Serif otherwise. Copy the two PDFs next to the report's `.tex` file.

## 3. Check against the report

`ir_reanalysis.py` prints the dilution steps; the decrease of the 1182 cm-1 reference (2.3-fold
for the 5-fold dilution from 27.20 to 5.44 mM, 3.0-fold for the 10-fold dilution); for 1916, 1944,
1958, 1610, 1628, 1636 and 1182 cm-1 the concentration-independent shares (0.10, 0.56, 0.52, 0.16,
0.49, 0.56, 0.35), the fit rms (1.2, 2.4, 1.7, 1.4, 0.7, 0.7 and 2.4% of the intensity at 27.2 mM)
and the RSS ratio of the monomer-dimer model to Eq. 23 (1.0, 0.5, 3.3, 2.3, 23.1, 18.6, 1.8); and
the 21.8 mM step at 1916 cm-1 (3.4% below the fit, 17 times its standard error).
