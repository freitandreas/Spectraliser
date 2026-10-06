<script lang="ts">
  import type { SpectrumDataset } from '../../types/project'

  export let datasets: SpectrumDataset[]
  $: references = datasets.filter((dataset) => dataset.processingDiagnostics?.referenceNormalization)
</script>

{#if references.length}
  <section class="reference-values" aria-label="Last-run reference values">
    <h4>Reference values (last run)</h4>
    <div class="reference-scroll">
      <table>
        <thead><tr><th>Sample</th><th>Mean</th><th>Window</th><th>Points</th></tr></thead>
        <tbody>
          {#each references as dataset (dataset.id)}
            {@const reference = dataset.processingDiagnostics!.referenceNormalization!}
            <tr>
              <th scope="row">{dataset.style.label || dataset.name}</th>
              <td>{reference.value.toPrecision(6)} {reference.yUnit}</td>
              <td>{reference.center} +/- {reference.halfWidth} {reference.xUnit}</td>
              <td>{reference.pointCount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .reference-values { min-width: 0; margin-top: 1rem; }
  h4 { margin: 0 0 .5rem; font-size: .85rem; }
  .reference-scroll { overflow-x: auto; max-height: 240px; }
  table { width: 100%; border-collapse: collapse; font-size: .75rem; }
  th, td { padding: .4rem; text-align: left; border-bottom: 1px solid var(--border, #d4d4d4); }
  tbody th { overflow-wrap: anywhere; min-width: 70px; }
  td { font-variant-numeric: tabular-nums; }
</style>