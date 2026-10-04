<script lang="ts">
  import type { TransformDefinition } from '../../types/project'
  import SettingBadge from './SettingBadge.svelte'
  import type { BadgeInfo } from './settingBadge'
  import {
    NORMALIZATION_MODES,
    PEAK_PROFILE_MODELS,
    describeOption,
  } from './workbenchUtils'

  type Params = Record<string, number | string | boolean>

  export let pipeline: TransformDefinition[]
  export let onEnabled: (transformId: string, enabled: boolean) => void
  export let onParams: (transformId: string, params: Params) => void
  /** Optional per-step marker, e.g. "differs from general" or "3 samples differ". */
  export let badgeFor: (type: TransformDefinition['type']) => BadgeInfo | null = () => null

  const STEP_META: Record<string, { title: string; summary: string }> = {
    crop: { title: 'Crop', summary: 'Restrict the spectrum to an abscissa window.' },
    baseline: { title: 'Baseline', summary: 'Subtract a fitted polynomial baseline.' },
    smoothing: { title: 'Smoothing', summary: 'Savitzky-Golay filter on the ordinate.' },
    inversion: { title: 'Inversion', summary: 'Flip the sign of the ordinate.' },
    normalization: { title: 'Normalisation', summary: 'Rescale the ordinate to a common range.' },
    peak_localisation: { title: 'Peak localisation', summary: 'Fit detected peaks with Gaussian or Lorentzian profiles.' },
  }

  function stepMeta(type: string): { title: string; summary: string } {
    return STEP_META[type] ?? { title: type, summary: 'Custom processing step.' }
  }
</script>

<p class="pipeline-intro">Steps run top to bottom on the original data.</p>
<ol class="pipeline-list">
  {#each pipeline as transform, stepIndex (transform.id)}
    <li class="pipeline-step" class:active={transform.enabled}>
      <div class="pipeline-step-header">
        <span class="pipeline-index" aria-hidden="true">{stepIndex + 1}</span>
        <div class="pipeline-step-heading">
          <span class="pipeline-step-title">{stepMeta(transform.type).title}</span>
          <span class="pipeline-step-summary">{stepMeta(transform.type).summary}</span>
          <SettingBadge info={badgeFor(transform.type)} />
        </div>
        <label class="pipeline-switch">
          <input
            type="checkbox"
            checked={transform.enabled}
            aria-label={`Enable ${stepMeta(transform.type).title}`}
            on:change={(event) =>
              onEnabled(transform.id, (event.target as HTMLInputElement).checked)}
          />
          <span class="pipeline-switch-track" aria-hidden="true"></span>
        </label>
      </div>

      {#if transform.enabled}
        <div class="pipeline-step-body">
          {#if transform.type === 'crop'}
            <div class="pipeline-params">
              <label>
                <span>Abscissa min</span>
                <input
                  type="number"
                  value={Number(transform.params.x_min ?? 0)}
                  on:change={(event) =>
                    onParams(transform.id, { x_min: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
              <label>
                <span>Abscissa max</span>
                <input
                  type="number"
                  value={Number(transform.params.x_max ?? 0)}
                  on:change={(event) =>
                    onParams(transform.id, { x_max: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
            </div>
          {/if}

          {#if transform.type === 'baseline'}
            <div class="pipeline-params single">
              <label>
                <span>Polynomial order</span>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={Number(transform.params.order ?? 3)}
                  on:change={(event) =>
                    onParams(transform.id, { order: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
            </div>
          {/if}

          {#if transform.type === 'smoothing'}
            <div class="pipeline-params">
              <label>
                <span>Window length</span>
                <input
                  type="number"
                  min="3"
                  step="2"
                  value={Number(transform.params.window_length ?? 15)}
                  on:change={(event) =>
                    onParams(transform.id, { window_length: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
              <label>
                <span>Poly order</span>
                <input
                  type="number"
                  min="1"
                  value={Number(transform.params.polyorder ?? 2)}
                  on:change={(event) =>
                    onParams(transform.id, { polyorder: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
            </div>
          {/if}

          {#if transform.type === 'normalization'}
            <div class="pipeline-params single">
              <label>
                <span>Mode</span>
                <select
                  value={String(transform.params.mode ?? 'minmax')}
                  on:change={(event) =>
                    onParams(transform.id, { mode: (event.target as HTMLSelectElement).value })}
                >
                  {#each NORMALIZATION_MODES as mode (mode.id)}
                    <option value={mode.id}>{mode.label} — {mode.description}</option>
                  {/each}
                </select>
              </label>
              <p class="option-description">
                {describeOption(NORMALIZATION_MODES, String(transform.params.mode ?? 'minmax'))}
              </p>
            </div>
          {/if}

          {#if transform.type === 'peak_localisation'}
            <div class="pipeline-params">
              <label>
                <span>Profile</span>
                <select
                  value={String(transform.params.model ?? 'gaussian')}
                  on:change={(event) =>
                    onParams(transform.id, { model: (event.target as HTMLSelectElement).value })}
                >
                  {#each PEAK_PROFILE_MODELS as model (model.id)}
                    <option value={model.id}>{model.label} — {model.description}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Prominence</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={Number(transform.params.prominence ?? 0.05)}
                  on:change={(event) =>
                    onParams(transform.id, { prominence: Number((event.target as HTMLInputElement).value) })}
                />
              </label>
              <p class="option-description">
                {describeOption(PEAK_PROFILE_MODELS, String(transform.params.model ?? 'gaussian'))}
              </p>
            </div>
          {/if}

        </div>
      {/if}
    </li>
  {/each}
</ol>
