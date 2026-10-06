"""Re-analysis of the AE-509 in-situ IR dilution series (report Section 4.1, Figure 7).

Input:  a Spectraliser Python export of the IR project, extracted to analysis/sessions/ir
        (all 82 spectra of AE-509-2.csv in acquisition order; processing settings are ignored,
        the export always contains the original ordinate).
Run:    python analysis/ir_reanalysis.py [--session DIR] [--out DIR]
Needs:  numpy, pandas, scipy, matplotlib

AsLS and the reference window come from Spectraliser's own processing module in src/python of
the same checkout, so the figure always matches the code at the commit cited in the report.

Steps
1. Load the 82 spectra listed in samples.json (order = acquisition order).
2. Group spectra 49-82 into the eleven dilution steps recorded in ELN AE-509
   (number of spectra collected before each MeCN addition and the added volume).
3. Average each step, subtract an AsLS baseline (lam = 1e5, p = 0.01, 10 iterations) and,
   for panel (a), divide by the corrected value at 1182 cm-1, as in the AE-509 scripts.
4. For the steps before the fibre was touched (27.2 to 5.44 mM), fit the corrected
   intensity at every wavenumber as I(nu) = k(nu) * c + r(nu), i.e. a spectrum that is
   proportional to concentration plus a concentration-independent contribution.
5. At the band positions discussed in the report, compare this fit with a two-species
   monomer-dimer model I = a * [M] + b * c (2 M <=> D, association constant chosen per position).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / 'src' / 'python'))
try:
    from processing import asls_baseline, reference_window
except ImportError as error:
    sys.exit(f'Spectraliser processing module with AsLS not found in {REPO / "src" / "python"}: {error}')
SOURCE = f'Spectraliser processing module ({REPO / "src" / "python"})'

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument('--session', type=Path, default=HERE / 'sessions' / 'ir',
                    help='extracted Spectraliser Python export of the IR project')
parser.add_argument('--out', type=Path, default=HERE / 'figures', help='output directory')
ARGS = parser.parse_args()
SESSION, OUT = ARGS.session, ARGS.out
N_SPECTRA = 82

# ELN AE-509: spectra collected before each addition, and added dry MeCN (mL)
ADDITIONS = [(56, .05), (60, .05), (63, .10), (66, .10), (69, .10),
             (72, .20), (75, .20), (77, .20), (79, .30), (81, .50)]
FIRST_USABLE, LAST = 49, 82        # spectra 1-32 blank MeCN, 33-48 unstable (LN2 refill)
V0_ML, C0_MM = 0.2, 27.2           # 5.44 umol in 0.2 mL
FIBRE_TOUCHED = 79                 # offset from spectrum 79 onwards (ELN)
ASLS_LAM, ASLS_P, ASLS_ITER, REF_WN = 1e5, 0.01, 10, 1182
REF_HALF_WIDTH = 1                 # single 2 cm-1 point at 1182 cm-1, as in the AE-509 scripts
BANDS = (1916, 1944, 1958)         # positions on the 2 cm-1 grid: k maximum and r maxima
REPORTED = BANDS + (1610, 1628, 1636, REF_WN)
K_GRID = np.logspace(-2, 6, 400)   # association constants for 2 M <=> D, in mM^-1


def _elapsed_seconds(label):
    match = re.fullmatch(r'\s*(\d+):(\d{2}):(\d{2})\s*', str(label))
    return None if match is None else 3600 * int(match[1]) + 60 * int(match[2]) + int(match[3])


def load_session(path):
    samples = json.loads((path / 'samples.json').read_text(encoding='utf-8'))
    if len(samples) != N_SPECTRA:
        sys.exit(f'Expected {N_SPECTRA} spectra in {path}, found {len(samples)}. Export the complete '
                 'AE-509 project without deleting spectra.')
    labels = [(sample.get('style') or {}).get('label') or sample.get('name') for sample in samples]
    elapsed = [_elapsed_seconds(label) for label in labels]
    if None not in elapsed and np.any(np.diff(elapsed) <= 0):
        sys.exit('Spectra in samples.json are not in acquisition order; re-export without reordering.')
    spectra, x = [], None
    for sample in samples:
        frame = pd.read_csv(path / sample['dataFile'])
        x = frame.iloc[:, 0].to_numpy(float)
        spectra.append(frame.iloc[:, 1].to_numpy(float))
    return x, np.array(spectra)


def dilution_steps():
    starts = [FIRST_USABLE] + [n + 1 for n, _ in ADDITIONS] + [LAST + 1]
    volume, steps = V0_ML, []
    for i in range(len(starts) - 1):
        if i:
            volume += ADDITIONS[i - 1][1]
        steps.append((C0_MM * V0_ML / volume, list(range(starts[i], starts[i + 1]))))
    return steps


def main():
    x, spectra = load_session(SESSION)
    order = np.argsort(x)
    wn = x[order]
    steps = dilution_steps()
    conc = np.array([c for c, _ in steps])
    averaged = np.array([spectra[[n - 1 for n in numbers]].mean(axis=0)[order] for _, numbers in steps])
    corrected = np.array([y - asls_baseline(y, ASLS_LAM, ASLS_P, ASLS_ITER) for y in averaged])
    params = {'reference_x': REF_WN, 'reference_half_width': REF_HALF_WIDTH}
    reference = np.array([reference_window(pd.DataFrame({'abscissa': wn, 'ordinate_modified': y}), params)['value']
                          for y in corrected])
    normalised = corrected / reference[:, None]
    print('AsLS and reference normalisation from:', SOURCE)

    before_touch = np.array([max(numbers) < FIBRE_TOUCHED for _, numbers in steps])
    design = np.vstack([conc[before_touch], np.ones(before_touch.sum())]).T
    (k, r), *_ = np.linalg.lstsq(design, corrected[before_touch], rcond=None)
    rms = np.sqrt(((corrected[before_touch] - design @ np.vstack([k, r])) ** 2).mean(axis=0))

    OUT.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({'wavenumber': wn, 'k_per_mM': k, 'r_constant': r, 'fit_rms': rms}).to_csv(
        OUT / 'ir_linear_decomposition.csv', index=False)
    table = pd.DataFrame(corrected.T, columns=[f'{c:.2f} mM' for c in conc])
    table.insert(0, 'wavenumber', wn)
    table.to_csv(OUT / 'ir_asls_corrected_per_step.csv', index=False)

    print('Dilution steps (mM, spectra):')
    for c, numbers in steps:
        print(f'  {c:6.2f}  {numbers[0]}-{numbers[-1]}')
    last_fit = np.flatnonzero(before_touch)[-1]
    print(f'AsLS-corrected value at {REF_WN} cm-1 falls {reference[0] / reference[last_fit]:.1f}-fold '
          f'for a {conc[0] / conc[last_fit]:.0f}-fold dilution ({conc[0]:.2f} to {conc[last_fit]:.2f} mM) and '
          f'{reference[0] / reference[-1]:.1f}-fold for a {conc[0] / conc[-1]:.0f}-fold dilution')

    c_fit, y_fit = conc[before_touch], corrected[before_touch]
    residuals = y_fit - design @ np.vstack([k, r])

    def rss(basis, y):
        coefficients, *_ = np.linalg.lstsq(basis, y, rcond=None)
        return float(((y - basis @ coefficients) ** 2).sum())

    def monomer(K):
        return (np.sqrt(1 + 8 * K * c_fit) - 1) / (4 * K)

    print('Position: concentration-independent share at 27.2 mM, fit rms (% of I at 27.2 mM), '
          'RSS(monomer-dimer)/RSS(Eq. 23), residuals 27.2 -> 5.44 mM')
    for target in REPORTED:
        i = np.argmin(abs(wn - target))
        share = r[i] / (k[i] * conc[0] + r[i])
        linear = rss(design, y_fit[:, i])
        dimer = min(rss(np.vstack([c_fit, monomer(K)]).T, y_fit[:, i]) for K in K_GRID)
        print(f'  {wn[i]:.0f} cm-1: share {share:.2f}, rms {100 * rms[i] / corrected[0, i]:.1f}%, '
              f'RSS ratio {dimer / linear:.1f}, residuals ' + ' '.join(f'{v:+.2g}' for v in residuals[:, i]))

    i, step = np.argmin(abs(wn - 1916)), 1
    single = np.array([(y - asls_baseline(y, ASLS_LAM, ASLS_P, ASLS_ITER))[i]
                       for y in (spectra[n - 1][order] for n in steps[step][1])])
    error = single.std(ddof=1) / np.sqrt(single.size)
    print(f'{conc[step]:.1f} mM step at 1916 cm-1: {100 * -residuals[step, i] / corrected[step, i]:.1f}% below the fit, '
          f'{-residuals[step, i] / error:.0f} times its standard error')
    return wn, conc, corrected, normalised, k, r, before_touch


def plot(wn, conc, corrected, normalised, k, r, before_touch, filename):
    import matplotlib as mpl
    import matplotlib.pyplot as plt
    mpl.rcParams.update({'font.family': 'serif',
                         'font.serif': ['Latin Modern Roman', 'CMU Serif', 'DejaVu Serif'],
                         'mathtext.fontset': 'cm',
                         'font.size': 9, 'axes.linewidth': .6, 'xtick.major.width': .6,
                         'ytick.major.width': .6, 'legend.frameon': False})
    cmap = mpl.colormaps['viridis']
    norm = mpl.colors.LogNorm(vmin=conc.min(), vmax=conc.max())
    window = (wn >= 1860) & (wn <= 2040)
    fig, axes = plt.subplots(2, 2, figsize=(17 / 2.54, 11.5 / 2.54), constrained_layout=True)
    (a, b), (c, d) = axes

    for data, ax, label in ((normalised, a, r'$I/I_{1182}$'), (corrected, b, 'Absorbance / a.u.')):
        for y, ci in zip(data, conc):
            ax.plot(wn[window], y[window], color=cmap(norm(ci)), lw=.9)
        ax.set_xlim(2040, 1860)
        ax.set_xlabel(r'Wavenumber / cm$^{-1}$')
        ax.set_ylabel(label)
        for line in BANDS:
            ax.axvline(line, color='0.6', lw=.5, ls=':')
    a.set_title('(a) Normalised at 1182 cm$^{-1}$ (AE-509 workflow)', loc='left', fontsize=9)
    b.set_title('(b) Without reference normalisation', loc='left', fontsize=9)
    bar = fig.colorbar(mpl.cm.ScalarMappable(norm=norm, cmap=cmap), ax=[a, b], pad=.01, aspect=30)
    bar.set_label('$c$ / mM')
    bar.ax.yaxis.set_minor_formatter(mpl.ticker.NullFormatter())
    bar.set_ticks([2.72, 5.44, 10.9, 27.2], labels=['2.72', '5.44', '10.9', '27.2'])

    markers = dict(zip(BANDS, (('o', 'C0'), ('s', 'C1'), ('^', 'C2'))))
    grid = np.linspace(0, conc.max(), 50)
    for target, (marker, colour) in markers.items():
        i = np.argmin(abs(wn - target))
        c.plot(conc[before_touch], corrected[before_touch, i], marker, color=colour, ms=4,
               label=f'{target} cm$^{{-1}}$')
        c.plot(conc[~before_touch], corrected[~before_touch, i], marker, mfc='none', color=colour, ms=4)
        c.plot(grid, k[i] * grid + r[i], '-', color=colour, lw=.8)
    c.set_xlabel('$c$ / mM')
    c.set_ylabel('Absorbance / a.u.')
    c.set_xlim(0, 28.5)
    c.set_ylim(bottom=0)
    c.legend(loc='upper left', fontsize=8)
    c.set_title('(c) Band intensity vs. concentration', loc='left', fontsize=9)

    d.plot(wn[window], k[window] * conc.max(), color='k', lw=.9, label=r'$k(\tilde\nu)\cdot 27.2$ mM')
    d.plot(wn[window], r[window], color='C3', lw=.9, label=r'$r(\tilde\nu)$ (constant)')
    d.set_xlim(2040, 1860)
    d.set_xlabel(r'Wavenumber / cm$^{-1}$')
    d.set_ylabel('Absorbance / a.u.')
    d.legend(loc='upper left', fontsize=8)
    d.set_title('(d) Linear decomposition, 27.2–5.44 mM', loc='left', fontsize=9)
    for line in BANDS:
        d.axvline(line, color='0.6', lw=.5, ls=':')
    fig.savefig(filename)


if __name__ == '__main__':
    results = main()
    plot(*results, OUT / 'ir_carbonyl_reanalysis.pdf')
