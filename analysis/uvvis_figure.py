"""Unprocessed UV/Vis irradiation series, SI Section 8.3 (report Section 4.2, Figure 8).

Input:  a Spectraliser Python export of the UV/Vis project, extracted to analysis/sessions/uvvis
        (the 13 JS_603_<t>min_abs.csv spectra; processing settings are ignored, the export
        always contains the original ordinate).
Run:    python analysis/uvvis_figure.py [--session DIR] [--out DIR]
Needs:  numpy, pandas, matplotlib
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument('--session', type=Path, default=HERE / 'sessions' / 'uvvis',
                    help='extracted Spectraliser Python export of the UV/Vis project')
parser.add_argument('--out', type=Path, default=HERE / 'figures', help='output directory')
ARGS = parser.parse_args()
SESSION, OUT = ARGS.session, ARGS.out
EXPECTED_MINUTES = {0, 1, 3, 5, 10, 20, 30, 60, 90, 120, 190, 240, 1187}
LATE = 1187            # spectrum outside the published series
TRACES = (300, 395, 550)


def load(path):
    spectra, wavelength = {}, None
    for sample in json.loads((path / 'samples.json').read_text(encoding='utf-8')):
        name = sample['name']
        if 'trans' in name.lower():
            continue                      # use the absorbance files only
        match = re.search(r'_(\d+)min', name)
        if match is None:
            sys.exit(f'Cannot read the irradiation time from sample name {name!r}.')
        minutes = int(match.group(1))
        if minutes in spectra:
            sys.exit(f'Two spectra for {minutes} min in {path}.')
        frame = pd.read_csv(path / sample['dataFile'])
        wavelength = frame.iloc[:, 0].to_numpy(float)
        spectra[minutes] = frame.iloc[:, 1].to_numpy(float)
    if set(spectra) != EXPECTED_MINUTES:
        sys.exit(f'Expected spectra for {sorted(EXPECTED_MINUTES)} min, found {sorted(spectra)}.')
    return wavelength, dict(sorted(spectra.items()))


def crossings_with_initial(wavelength, spectra, low=320, high=420):
    """Wavelength where each spectrum crosses the 0 min spectrum (isosbestic test)."""
    mask = (wavelength >= low) & (wavelength <= high)
    result = {}
    for minutes, absorbance in spectra.items():
        if minutes in (0, LATE):
            continue
        diff = (absorbance - spectra[0])[mask]
        sign_change = np.where(np.sign(diff[:-1]) != np.sign(diff[1:]))[0]
        if sign_change.size:
            i = sign_change[0]
            x0, x1 = wavelength[mask][i], wavelength[mask][i + 1]
            result[minutes] = x0 - diff[i] * (x1 - x0) / (diff[i + 1] - diff[i])
    return result


def main():
    wavelength, spectra = load(SESSION)
    at = lambda minutes, nm: spectra[minutes][np.argmin(abs(wavelength - nm))]
    print(f'{len(spectra)} spectra, {wavelength.size} points, {wavelength.min()}-{wavelength.max()} nm')
    print('A(370 nm, 0 min) = %.3f; A(305 nm, 0 min) = %.3f' % (at(0, 370), at(0, 305)))
    below = (wavelength >= 200) & (wavelength < 265)
    print('A at 200-265 nm: %.2f-%.2f in all spectra' % (min(s[below].min() for s in spectra.values()),
                                                         max(s[below].max() for s in spectra.values())))
    for nm in TRACES:
        print(f'A({nm} nm):', ', '.join(f'{m} min {at(m, nm):.2f}' for m in spectra))
    cross = crossings_with_initial(wavelength, spectra)
    print('crossing with 0 min spectrum:', ', '.join(f'{m} min {x:.1f} nm' for m, x in cross.items()))
    long = wavelength >= 990
    offsets = [s[long].mean() for s in spectra.values()]
    print('mean A at 990-1020 nm: %.3f to %.3f' % (min(offsets), max(offsets)))
    return wavelength, spectra


def plot(wavelength, spectra, filename):
    import matplotlib as mpl
    import matplotlib.pyplot as plt
    mpl.rcParams.update({'font.family': 'serif',
                         'font.serif': ['Latin Modern Roman', 'CMU Serif', 'DejaVu Serif'],
                         'mathtext.fontset': 'cm',
                         'font.size': 9, 'axes.linewidth': .6, 'xtick.major.width': .6,
                         'ytick.major.width': .6, 'legend.frameon': False})
    series = {m: a for m, a in spectra.items() if m != LATE}
    cmap = mpl.colormaps['viridis']
    norm = mpl.colors.Normalize(vmin=0, vmax=max(series))

    fig = plt.figure(figsize=(17 / 2.54, 7.2 / 2.54), constrained_layout=True)
    grid = fig.add_gridspec(1, 3, width_ratios=[1.55, .78, .16])
    a = fig.add_subplot(grid[0])
    b = fig.add_subplot(grid[1])
    b2 = fig.add_subplot(grid[2], sharey=b)

    a.axvspan(250, 270, color='0.85', lw=0)
    a.axvspan(350, 400, color='#7b5ea7', alpha=.13, lw=0)
    a.axvspan(455, 630, color='#3a9a5b', alpha=.10, lw=0)
    a.text(375, 3.3, 'MLCT of 1', ha='center', fontsize=7, color='#5b3f87')
    a.text(542, 3.3, 'second-photon range', ha='center', fontsize=7, color='#2a7445')
    for minutes, absorbance in series.items():
        a.plot(wavelength, absorbance, color=cmap(norm(minutes)), lw=.8)
    a.plot(wavelength, spectra[LATE], color='k', lw=.9, ls='--', label=f'{LATE} min')
    a.set_xlim(250, 750)
    a.set_ylim(0, 3.55)
    a.set_xlabel('Wavelength / nm')
    a.set_ylabel('Absorbance')
    a.legend(loc='center right', fontsize=8)
    a.set_title('(a) Unprocessed spectra', loc='left', fontsize=9)
    bar = fig.colorbar(mpl.cm.ScalarMappable(norm=norm, cmap=cmap), ax=a, pad=.01, aspect=25)
    bar.set_label('Irradiation time / min')

    markers = dict(zip(TRACES, ('o', 's', '^')))
    times = np.array(list(series))
    for nm, marker in markers.items():
        i = np.argmin(abs(wavelength - nm))
        values = np.array([series[m][i] for m in times])
        b.plot(times, values, marker + '-', ms=3.5, lw=.8, label=f'{nm} nm')
        b2.plot([LATE], [spectra[LATE][i]], marker, ms=3.5, color=b.lines[-1].get_color())
    b.set_xlim(-8, 250)
    b2.set_xlim(LATE - 15, LATE + 15)
    b2.set_xticks([LATE])
    b.spines['right'].set_visible(False)
    b2.spines['left'].set_visible(False)
    b2.tick_params(left=False, labelleft=False)
    for ax, x in ((b, 1), (b2, 0)):
        ax.plot([x], [0], transform=ax.transAxes, marker=[(-1, -1.5), (1, 1.5)], ms=6, color='k', mew=.6, clip_on=False)
    b.set_ylim(0, 2.75)
    b.set_xlabel('Time / min', x=.6)
    b.set_ylabel('Absorbance')
    b.legend(loc='center right', bbox_to_anchor=(1, .3), fontsize=8)
    b.set_title('(b) Single-wavelength traces', loc='left', fontsize=9)
    fig.savefig(filename)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    data = main()
    plot(*data, OUT / 'uvvis_raw_absorbance.pdf')
