<script lang="ts">
  import type { ComputePrecision } from '../services/startupPreferences'

  export let precision: ComputePrecision
  export let onChange: (next: ComputePrecision) => void

  const options: Array<{ id: ComputePrecision; title: string; detail: string }> = [
    {
      id: 'float32',
      title: 'Single precision (float32)',
      detail: 'Faster and lighter. About 7 significant digits — sufficient for typical absorbance and intensity data.',
    },
    {
      id: 'float64',
      title: 'Double precision (float64)',
      detail: 'About 15–16 significant digits. Use for wide dynamic ranges, very fine abscissa spacing or derivatives.',
    },
  ]
</script>

<fieldset class="precision-settings">
  <legend>Python computation precision</legend>
  {#each options as option (option.id)}
    <label class="precision-option" class:chosen={precision === option.id}>
      <input
        type="radio"
        name="compute-precision"
        value={option.id}
        checked={precision === option.id}
        on:change={() => onChange(option.id)}
      />
      <span>
        <strong>{option.title}</strong>
        <small>{option.detail}</small>
      </span>
    </label>
  {/each}
  <p class="precision-note">
    Imported measurements are always stored unchanged; this only sets the arrays handed to the processing script.
    Changing it re-runs the script once for all visible samples.
  </p>
</fieldset>

<style>
  .precision-settings {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .precision-option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 10px;
    border: 1px solid var(--border, #3a3d46);
    border-radius: 6px;
    cursor: pointer;
  }

  .precision-option.chosen {
    border-color: var(--accent, #4fc1ff);
  }

  .precision-option span {
    display: grid;
    gap: 2px;
  }

  .precision-option small,
  .precision-note {
    color: var(--text-dim, #9aa0aa);
    font-size: .78rem;
    margin: 0;
  }
</style>
