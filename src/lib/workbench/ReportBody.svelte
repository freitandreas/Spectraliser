<script lang="ts">
  import type { ReportContent } from '../../services/export/reportContent'
  import { GENERAL_SECTION_INTRO, GENERAL_SECTION_TITLE, PROCESSING_HEADERS } from '../../services/export/reportContent'

  export let content: ReportContent
</script>

<h2>{GENERAL_SECTION_TITLE}</h2>
<p>{GENERAL_SECTION_INTRO}</p>
<table class="fields">
  <tbody>{#each content.overview as [field, value]}<tr><th>{field}</th><td>{value}</td></tr>{/each}</tbody>
</table>
<table class="processing">
  <thead><tr>{#each PROCESSING_HEADERS as header}<th>{header}</th>{/each}</tr></thead>
  <tbody>{#each content.processing as row}<tr><td>{row.step}</td><td>{row.status}</td><td>{row.parameters}</td></tr>{/each}</tbody>
</table>
{#if content.pythonNote}<p>{content.pythonNote}</p>{/if}

<h2>Samples</h2>
{#each content.samples as sample (sample.id)}
  <section class="report-sample">
    <h3>{sample.name}</h3>
    <h4>Metadata</h4>
    <table class="fields">
      <tbody>{#each sample.metadata as [field, value]}<tr><th>{field}</th><td>{value}</td></tr>{/each}</tbody>
    </table>
    {#if sample.differences.length}
      <h4>Processing deviating from the general pipeline</h4>
      <table>
        <thead><tr>{#each PROCESSING_HEADERS as header}<th>{header}</th>{/each}</tr></thead>
        <tbody>{#each sample.differences as row}<tr><td>{row.step}</td><td>{row.status}</td><td>{row.parameters}</td></tr>{/each}</tbody>
      </table>
    {/if}
    <h4>Peaks</h4>
    {#if sample.peaks.rows.length}
      <div class="table-scroll">
        <table class="peaks">
          <caption>{sample.peaks.caption}</caption>
          <thead><tr>{#each sample.peaks.headers as header}<th>{header}</th>{/each}</tr></thead>
          <tbody>{#each sample.peaks.rows as row}<tr>{#each row as cell}<td>{cell}</td>{/each}</tr>{/each}</tbody>
        </table>
      </div>
    {:else}
      <p class="caption">{sample.peaks.caption}</p>
      <p>No peaks detected.</p>
    {/if}
  </section>
{/each}

<style>
  h2{font-size:1.3em;margin:1.4em 0 .4em}
  h3{font-size:1.1em;margin:1.2em 0 .3em}
  h4{font-size:.95em;margin:.8em 0 .3em}
  p{margin:.3em 0}
  table{width:100%;border-collapse:collapse;font-size:.85em}
  th,td{text-align:left;border-bottom:1px solid #bbb;padding:.25em .4em;vertical-align:top;font-weight:normal}
  thead th{border-bottom:1.5px solid #333;font-weight:600}
  .fields th{width:28%;font-weight:600}
  .processing{margin-top:.8em}
  caption,.caption{caption-side:top;text-align:left;font-size:.95em;color:#333;padding:0 0 .3em;white-space:normal}
  .table-scroll{overflow-x:auto}
  .peaks td{font-variant-numeric:tabular-nums;white-space:nowrap}
</style>
