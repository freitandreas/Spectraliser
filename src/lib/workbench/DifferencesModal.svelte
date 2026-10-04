<script lang="ts">
  import HelpTip from '../HelpTip.svelte'
  import type { SpectrumDataset } from '../../types/project'
  import {
    generalSettingText,
    sampleSettingText,
    settingKeys,
    settingLabel,
    type GeneralSettingsSnapshot,
    type SettingKey,
  } from '../../services/generalSettings'
  import { COLOR_PALETTES } from '../../services/palettes'

  export let open: boolean
  export let datasets: SpectrumDataset[]
  export let snapshot: GeneralSettingsSnapshot
  /** Differing keys per dataset, in the same order as `datasets`. */
  export let differences: SettingKey[][]
  /** Columns that are shown even when every sample follows them. */
  export let focusKeys: SettingKey[] = []
  export let onReset: (datasetId: string, key: SettingKey) => void
  export let onClose: () => void

  $: columns = settingKeys(snapshot).filter((key) =>
    focusKeys.includes(key) || differences.some((keys) => keys.includes(key)))
  $: paletteName = COLOR_PALETTES.find((palette) => palette.id === snapshot.paletteId)?.name ?? snapshot.paletteId

  function generalText(key: SettingKey): string {
    return key === 'lineColor' ? `${paletteName} palette` : generalSettingText(snapshot, { index: 0, count: datasets.length }, key)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') onClose()
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="confirm-backdrop" role="presentation" on:click|self={onClose}>
    <div class="confirm-modal differences-modal" role="dialog" aria-modal="true" aria-label="Samples that differ from general settings">
      <h3>Differences from general settings <HelpTip label="Differences" text="Highlighted cells use a sample-specific value. Use ↺ to make that sample follow the general setting again." /></h3>
      {#if columns.length === 0}
        <p>Every sample follows the general settings.</p>
      {:else}
        <div class="differences-scroll">
          <table class="differences-table">
            <thead>
              <tr>
                <th scope="col">Series</th>
                {#each columns as key (key)}
                  <th scope="col">{settingLabel(key)}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              <tr class="general-row">
                <th scope="row">General</th>
                {#each columns as key (key)}
                  <td>{generalText(key)}</td>
                {/each}
              </tr>
              {#each datasets as dataset, index (dataset.id)}
                <tr>
                  <th scope="row">
                    <span class="differences-swatch" style={`background:${dataset.style.lineColor};`}></span>
                    {dataset.style.label}
                  </th>
                  {#each columns as key (key)}
                    {@const differs = differences[index]?.includes(key) ?? false}
                    <td class:differs>
                      {#if key === 'lineColor'}
                        <span class="differences-swatch" style={`background:${dataset.style.lineColor};`}></span>
                      {/if}
                      {sampleSettingText(dataset, key)}
                      {#if differs}
                        <button
                          type="button"
                          class="setting-badge-action"
                          title={`Follow general: ${generalSettingText(snapshot, { index, count: datasets.length }, key)}`}
                          aria-label={`Reset ${settingLabel(key)} of ${dataset.style.label}`}
                          on:click={() => onReset(dataset.id, key)}
                        >↺</button>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      <div class="confirm-actions">
        <button type="button" class="run" on:click={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}
