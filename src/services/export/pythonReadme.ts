export const PYTHON_PROJECT_REQUIREMENTS = 'numpy\npandas\nscipy\nplotly>=6,<7\n'

export const PYTHON_PROJECT_README = `# Spectraliser Python project

## Setup (Python 3.10 or newer)

Extract the ZIP and open a terminal in this directory. Virtual environments
are machine-specific and are deliberately not bundled. No global packages
are installed and no environment is created automatically.

Linux / macOS:

\`\`\`sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
\`\`\`

Windows PowerShell:

\`\`\`powershell
py -3 -m venv .venv
.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt
.\\.venv\\Scripts\\python.exe main.py
\`\`\`

Using the environment's Python directly needs no activation. Alternatively,
activate it with \`source .venv/bin/activate\` (Linux / macOS) or
\`.\\.venv\\Scripts\\Activate.ps1\` (PowerShell), then run \`python main.py\`.
Keep using this interpreter in your IDE.

## Processing and plotting

- \`main.py\` preserves your current editor script and processes the source CSVs
  via \`samples.json\`, including each sample's exported pipeline settings.
- \`data/\` contains the original measurements, not the processed ordinates.
- \`plot.json\` is a snapshot of the **current processed figure at export time**.
  It preserves the plot type (overlay, heatmap or 3D surface), visible series,
  colours, line/marker settings, labels, axis direction, metadata coordinates,
  peaks and the current 3D camera. Selection highlighting is not exported.
- After the entry script finishes successfully, \`plot_project.py\` writes
  \`plot.html\` and opens it in the default browser. Plotly is embedded in the
  HTML; fraction/TeX labels additionally need internet access for MathJax.
  If automatic opening is unavailable, open \`plot.html\` manually.
- The saved figure intentionally does **not** change when you edit Python
  processing or CSV files. Re-export from Spectraliser to refresh it.
  To display only the saved figure, run the environment's Python with
  \`-c "from plot_project import show_project_plot; show_project_plot()"\`.

Errors in your edited entry script are reported normally and prevent plotting.
Exported scripts are executable code: review custom edits before running them.
`
