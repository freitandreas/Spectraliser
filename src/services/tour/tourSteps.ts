export const TOUR_STEPS = [
  {
    title: 'Welcome to Spectraliser',
    target: '.plot-shell',
    text: 'Explore the workbench with five synthetic UV-Vis spectra. These are illustrative curves, not measurements. Your project is safely parked: Finish, Exit tour or Escape restores it. Controls are read-only during this guided walkthrough.',
    view: 'overview',
  },
  {
    title: 'Import your measurements',
    target: '.drop-field',
    text: 'Drop files into the sample explorer or use Data > Import files. The wizard accepts CSV, TSV, TXT and Excel, previews columns, detects delimiters and lets you choose the spectrum type and units. Keep one spectrum type per project.',
    view: 'overview',
  },
  {
    title: 'Manage and compare samples',
    target: '.sidebar',
    text: 'The explorer lists all five demo series. Select a sample to open its settings, use its visibility control to hide or show it, and expand it to access Data and Peaks. The Data menu can hide or show all samples together.',
    view: 'sample',
  },
  {
    title: 'Explore the plot',
    target: '.plot-shell',
    text: 'Compare band positions and intensities across the five curves. Outside the tour, hover to read coordinates, drag to zoom, double-click to reset and use Plotly controls to pan. Selecting or hovering a sample highlights its curve.',
    view: 'overview',
  },
  {
    title: 'Inspect data and metadata',
    target: '.bottom-panel',
    text: 'The Data tab shows numerical values and lets you compare original and modified data. Add Time, Concentration or custom metadata beside the table. Data > Metadata links a CSV experiment table using exact sample keys. Each demo already has time and concentration.',
    view: 'data',
  },
  {
    title: 'Configure axes and appearance',
    target: '.right-sidebar',
    text: 'General settings control shared axes, units and appearance. Sample settings control individual labels, colours and processing. Badges show deviations from general settings. Appearance also offers heatmap and 3D views using numeric metadata as a third axis.',
    view: 'settings',
  },
  {
    title: 'Visualise a series as a heatmap',
    target: '.plot-shell',
    text: 'The same five spectra are now arranged by their Time metadata (0 to 120 s). Colour represents absorbance. Heatmaps and 3D surfaces connect the supplied series; they do not create new measured spectra.',
    view: 'heatmap',
  },
  {
    title: 'Build a processing pipeline',
    target: '.right-sidebar',
    text: 'Processing controls include cropping, baseline correction, Savitzky-Golay smoothing, inversion, normalisation and peak localisation. Use General > Processing for shared settings or a sample’s Pipeline tab for individual steps. Python computation runs locally in a Pyodide worker.',
    view: 'processing',
  },
  {
    title: 'Analyse peaks',
    target: '.bottom-panel',
    text: 'The Peaks tab shows positions and shape information, with detection thresholds and automatic parameter options. You can add peaks from the plot, disable or remove peaks, and edit labels. The two demo bands are illustrative manual markers, not detection results. IR samples additionally support tentative assignments.',
    view: 'peaks',
  },
  {
    title: 'Inspect and edit Python',
    target: '.bottom-panel',
    text: 'The Script tab exposes the generated Python project and its processing modules. Execute processes samples in the browser worker. Manual Python edits can diverge from GUI settings; Revert To GUI State restores generated code. Automatic execution is paused during this tour.',
    view: 'script',
  },
  {
    title: 'Export and continue',
    target: '.toolbar-nav',
    text: 'Export offers plot images, PDF/HTML/LaTeX reports, peak and data tables, Python project ZIPs, CSV summaries and JSON snapshots. A live preview helps set physical figure size and resolution. Finish restores your original workspace; reopen the tour anytime with About/Help.',
    view: 'overview',
  },
] as const

export type TourView = (typeof TOUR_STEPS)[number]['view']
