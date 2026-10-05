import type { SpectrumDataset } from '../../types/project'
import type { ExportSettings } from './exportSettings'
import { formatCm } from './exportSettings'
import {
  GENERAL_SECTION_INTRO,
  GENERAL_SECTION_TITLE,
  PROCESSING_HEADERS,
  type PeakTable,
  type ProcessingRow,
  type ReportContent,
  type ReportTable,
} from './reportContent'

export const DATA_TABLE_HEADERS = ['Sample', 'X', 'Original Y', 'Processed Y'] as const

export function dataTableRows(datasets: SpectrumDataset[]): string[][] {
  return datasets.flatMap((dataset) => dataset.data.abscissa.map((x, index) => [
    dataset.style.label || dataset.name,
    String(x),
    String(dataset.data.ordinateOriginal[index] ?? ''),
    String(dataset.data.ordinateModified[index] ?? ''),
  ]))
}

function processingTable(rows: ProcessingRow[]): ReportTable {
  return { headers: [...PROCESSING_HEADERS], rows: rows.map((row) => [row.step, row.status, row.parameters]) }
}

function metadataTable(fields: Array<[string, string]>): ReportTable {
  return { headers: ['Field', 'Value'], rows: fields.map(([field, value]) => [field, value]) }
}

/** Worksheets of the Excel export: the report tables plus the full spectral data. */
export function excelSheets(content: ReportContent, datasets: SpectrumDataset[]): Array<{ name: string; rows: string[][] }> {
  const processing = processingTable(content.processing)
  return [
    {
      name: GENERAL_SECTION_TITLE,
      rows: [
        ...content.overview.map(([field, value]) => [field, value]),
        [],
        processing.headers,
        ...processing.rows,
        ...(content.pythonNote ? [[], [content.pythonNote]] : []),
      ],
    },
    {
      name: 'Sample metadata',
      rows: [['Sample', 'Field', 'Value'], ...content.samples.flatMap((sample) => sample.metadata.map(([field, value]) => [sample.name, field, value]))],
    },
    {
      name: 'Sample processing',
      rows: [['Sample', ...PROCESSING_HEADERS], ...content.samples.flatMap((sample) =>
        sample.differences.map((row) => [sample.name, row.step, row.status, row.parameters]))],
    },
    {
      name: 'Peaks',
      rows: content.samples.flatMap((sample, index) => [
        ...(index > 0 ? [[]] : []),
        [sample.name],
        [sample.peaks.caption],
        ...(sample.peaks.rows.length ? [sample.peaks.headers, ...sample.peaks.rows] : [['No peaks']]),
      ]),
    },
    { name: 'Spectral data', rows: [[...DATA_TABLE_HEADERS], ...dataTableRows(datasets)] },
  ]
}

export function latexEscape(value: string): string {
  return value.replace(/[\\&%$#_{}~^]/g, (character) => {
    if (character === '\\') return '\\textbackslash{}'
    if (character === '~') return '\\textasciitilde{}'
    if (character === '^') return '\\textasciicircum{}'
    return `\\${character}`
  })
}

function latexTable(table: ReportTable, wrapLast = false): string {
  const columns = table.headers.map((_, index) => (wrapLast && index === table.headers.length - 1 ? 'X' : 'l')).join('')
  const environment = wrapLast ? 'tabularx' : 'tabular'
  const width = wrapLast ? '{\\linewidth}' : ''
  return [
    `\\begin{${environment}}${width}{${columns}}`,
    '\\toprule',
    `${table.headers.map(latexEscape).join(' & ')} \\\\`,
    '\\midrule',
    ...table.rows.map((row) => `${row.map(latexEscape).join(' & ')} \\\\`),
    '\\bottomrule',
    `\\end{${environment}}`,
  ].join('\n')
}

function latexPeakTable(peaks: PeakTable): string {
  const caption = `\\captionof{table}{${latexEscape(peaks.caption)}}`
  if (!peaks.rows.length) return `\\begin{center}\n${caption}\nNo peaks detected.\n\\end{center}`
  // captionof keeps the table in place: one float per sample would pile up in long reports.
  return `\\begin{center}\n${caption}\n\\begin{adjustbox}{max width=\\linewidth}\n${latexTable(peaks)}\n\\end{adjustbox}\n\\end{center}`
}

/** Report body shared by the LaTeX report and the LaTeX tables export (booktabs and tabularx). */
export function latexReportBody(content: ReportContent): string {
  const samples = content.samples.map((sample) => [
    `\\subsection{${latexEscape(sample.name)}}`,
    '\\paragraph{Metadata}\\leavevmode\\\\[2pt]',
    latexTable(metadataTable(sample.metadata), true),
    ...(sample.differences.length
      ? ['\\paragraph{Processing deviating from the general pipeline}\\leavevmode\\\\[2pt]', latexTable(processingTable(sample.differences), true)]
      : []),
    '\\paragraph{Peaks}\\leavevmode',
    latexPeakTable(sample.peaks),
  ].join('\n\n')).join('\n\n')
  return [
    `\\section{${GENERAL_SECTION_TITLE}}`,
    `${GENERAL_SECTION_INTRO}\\\\[4pt]`,
    latexTable(metadataTable(content.overview), true),
    '\\medskip',
    latexTable(processingTable(content.processing), true),
    content.pythonNote ? `\n\\noindent ${latexEscape(content.pythonNote)}` : '',
    '\\section{Samples}',
    samples,
  ].join('\n\n')
}

export function latexTables(content: ReportContent): string {
  return `% Requires \\usepackage{booktabs,tabularx,adjustbox,caption}\n${latexReportBody(content)}\n`
}

export function latexReport(content: ReportContent, settings: ExportSettings): string {
  return `\\documentclass{article}
\\usepackage[margin=2cm]{geometry}
\\usepackage[export]{adjustbox}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{caption}
\\usepackage{fontspec}
\\setmainfont{${latexEscape(settings.fontFamily)}}
\\setlength{\\parindent}{0pt}
\\begin{document}
\\title{${latexEscape(content.title)}}\\date{\\today}\\maketitle
\\begin{figure}[ht]\\centering\\includegraphics[width=${formatCm(settings.widthCm)}cm,max width=\\linewidth]{plot.png}\\end{figure}
${latexReportBody(content)}
\\end{document}
`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function htmlTable(table: ReportTable, className = '', caption = ''): string {
  return `<table${className ? ` class="${className}"` : ''}>${caption ? `<caption>${escapeHtml(caption)}</caption>` : ''}<thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${
    table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`
}

export function reportHtml(content: ReportContent, plotDataUrl: string | null, settings: ExportSettings): string {
  const samples = content.samples.map((sample) => `<section class="sample"><h3>${escapeHtml(sample.name)}</h3>
<h4>Metadata</h4>${htmlTable(metadataTable(sample.metadata), 'fields')}
${sample.differences.length ? `<h4>Processing deviating from the general pipeline</h4>${htmlTable(processingTable(sample.differences))}` : ''}
<h4>Peaks</h4>${sample.peaks.rows.length ? htmlTable(sample.peaks, 'peaks', sample.peaks.caption) : `<p class="caption">${escapeHtml(sample.peaks.caption)}</p><p>No peaks detected.</p>`}</section>`).join('\n')
  // The figure keeps its physical width and aspect ratio, shrinking only when the page is narrower.
  const image = plotDataUrl
    ? `<img class="plot" src="${plotDataUrl}" alt="Spectrum plot" style="width:${formatCm(settings.widthCm)}cm">`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(content.title)}</title>
<style>@page{size:A4;margin:2cm}body{font-family:${JSON.stringify(settings.fontFamily)},sans-serif;font-size:${settings.fontSizePt}pt;color:#111;margin:0}h1{font-size:1.6em;margin:0 0 .2em}h2{font-size:1.3em;margin-top:1.4em}h3{font-size:1.1em;margin:1.2em 0 .3em}h4{font-size:.95em;margin:.8em 0 .3em}.plot{display:block;max-width:100%;height:auto;margin:1em auto;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:.85em}th,td{text-align:left;border-bottom:1px solid #bbb;padding:.25em .4em;vertical-align:top}thead th{border-bottom:1.5px solid #333}table.fields th:first-child,table.fields td:first-child{width:28%}.peaks td{font-variant-numeric:tabular-nums}caption,.caption{caption-side:top;text-align:left;font-size:.95em;color:#333;padding:0 0 .3em}.sample{break-inside:avoid-page}.meta{color:#555}</style></head>
<body><h1>${escapeHtml(content.title)}</h1><p class="meta">Generated ${escapeHtml(content.generated)}</p>${image}
<h2>${GENERAL_SECTION_TITLE}</h2><p>${GENERAL_SECTION_INTRO}</p>${htmlTable(metadataTable(content.overview), 'fields')}<br>${htmlTable(processingTable(content.processing))}${content.pythonNote ? `<p>${escapeHtml(content.pythonNote)}</p>` : ''}
<h2>Samples</h2>${samples}</body></html>`
}
