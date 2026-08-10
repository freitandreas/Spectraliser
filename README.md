# Spectra Visualiser

A browser-based spectroscopy data visualisation and processing tool. Load CSV/XLSX spectral data files, apply a non-destructive processing pipeline, inspect results interactively, and export a report together with a reproducible Python script.

## Features

- **Import wizard** — load CSV/TSV/XLSX files with configurable delimiter, decimal separator, header row, and column mapping. Supports multi-file batch import with a live table/plot preview.
- **Interactive plot** — renders all loaded spectra with Plotly. Highlights the selected spectrum, supports hover-point picking, and responds to window resizes automatically.
- **Non-destructive processing pipeline** — each spectrum carries an ordered pipeline of transform steps. Steps are applied in a fixed order (crop → baseline → smoothing → inversion → normalization → derivative). The original data is never modified.
  - **Crop** — restrict the x-axis range.
  - **Baseline correction** — polynomial fit subtraction (configurable degree).
  - **Smoothing** — Savitzky–Golay filter (configurable window length and polynomial order).
  - **Inversion** — negate the y-axis.
  - **Normalization** — min-max, vector (L2), area, or peak normalization.
  - **Derivative** — first or second derivative via Savitzky–Golay.
- **Python script generation** — a Python script (NumPy / pandas / SciPy) is auto-generated from the current pipeline and kept in sync with the GUI state. The script can be copied or exported to run the exact same processing outside the browser.
- **Report export** — produces a fully self-contained single-file HTML or pdf report. 
- **Autosave** — the project state is automatically persisted to IndexedDB (`spectralab` database) and restored on next visit.
- **Pyodide worker** — heavy pipeline computation runs in a Web Worker via Pyodide (Python in WebAssembly), keeping the UI responsive.

## Getting Started

### Prerequisites

- Node.js ≥ 18

### Install

```bash
npm install
```

### Development server

```bash
npm run dev
```

### Production build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Testing

```bash
npm test            # run tests once
npm run test:watch  # watch mode
npm run coverage    # coverage report
```

Tests live in the `tests/` directory and use Vitest with jsdom.

## Type checking

```bash
npm run check
```

## Project Structure

```
src/
  main.ts                        # App entry point
  App.svelte                     # Root component
  app.css                        # Global styles
  types/
    project.ts                   # Core type definitions (AppState, SpectrumDataset, …)
  lib/
    ImportWizard.svelte          # File import dialog
    PlotPanel.svelte             # Plotly chart wrapper
  services/
    import/
      importWizard.ts            # Import option defaults & validation
      parsers.ts                 # CSV/TSV/XLSX parsing
    script/
      scriptGenerator.ts         # Python script AST builder
      syncStateMachine.ts        # GUI ↔ script sync state machine
    export/
      htmlReport.ts              # Self-contained HTML report generator
    persistence/
      autosave.ts                # IndexedDB autosave helpers
    worker/
      workerClient.ts            # Web Worker RPC client
tests/                           # Vitest unit tests
```

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | [Svelte 5](https://svelte.dev) |
| Build tool | [Vite 8](https://vitejs.dev) |
| Language | TypeScript 6 |
| Charting | [Plotly.js](https://plotly.com/javascript/) |
| Code editor | [CodeMirror 6](https://codemirror.net) |
| Python runtime | [Pyodide](https://pyodide.org) (WebAssembly) |
| Spreadsheet parsing | [SheetJS (xlsx)](https://sheetjs.com) |
| Compression | [pako](https://github.com/nodeca/pako) (gzip) |
| Persistence | [idb](https://github.com/jakearchibald/idb) (IndexedDB) |
| Schema validation | [Zod](https://zod.dev) |
| Testing | [Vitest](https://vitest.dev) |
