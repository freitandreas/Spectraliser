<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { get } from 'svelte/store'
  import { appState, projectReady } from '../../state/projectContext'
  import { runtimeState } from '../../state/runtimeState'
  import { currentActivity } from '../../state/activityState'
  import { tourActive } from '../../state/tourState'
  import { createDemoProject } from '../../services/tour/demoProject'
  import { TOUR_STEPS, type TourView } from '../../services/tour/tourSteps'
  import type { AppState } from '../../types/project'

  export let onPrepare: () => () => void
  export let onView: (view: TourView, datasetId: string) => void

  let open = false
  let starting = false
  let error = ''
  let index = 0
  let original: AppState | null = null
  let restoreLayout: (() => void) | null = null
  let previousFocus: HTMLElement | null = null
  let dialog: HTMLElement | null = null
  let highlight = { top: 0, left: 0, width: 0, height: 0 }
  let observer: ResizeObserver | null = null
  let right = true
  $: step = TOUR_STEPS[index]!

  export async function start(): Promise<void> {
    if (open || starting) return
    starting = true
    error = ''
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    try {
      await projectReady
      if (get(runtimeState).workerBusy || get(runtimeState).scriptProgress.active || get(currentActivity)) {
        throw new Error('Wait for the current analysis to finish, then start the tour again.')
      }
      tourActive.set(true)
      original = get(appState)
      restoreLayout = onPrepare()
      appState.set(createDemoProject(original))
      index = 0
      open = true
      await showStep()
      dialog?.focus()
    } catch (cause) {
      await finish()
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      starting = false
    }
  }

  function measure(): void {
    const target = document.querySelector(step.target)
    if (!target) return
    const rect = target.getBoundingClientRect()
    highlight = {
      top: Math.max(0, rect.top - 4),
      left: Math.max(0, rect.left - 4),
      width: Math.max(0, Math.min(rect.width + 8, window.innerWidth - rect.left)),
      height: Math.max(0, Math.min(rect.height + 8, window.innerHeight - rect.top)),
    }
    right = rect.left + rect.width / 2 < window.innerWidth / 2
  }

  async function showStep(): Promise<void> {
    onView(step.view, 'tour-spectrum-1')
    await tick()
    observer?.disconnect()
    const target = document.querySelector(step.target)
    if (target) {
      observer = new ResizeObserver(measure)
      observer.observe(target)
    }
    measure()
  }

  async function move(delta: number): Promise<void> {
    index = Math.min(TOUR_STEPS.length - 1, Math.max(0, index + delta))
    await tick()
    await showStep()
  }

  async function finish(): Promise<void> {
    observer?.disconnect()
    observer = null
    if (original) appState.set(original)
    original = null
    restoreLayout?.()
    restoreLayout = null
    open = false
    // Keep execution paused until restored project inputs have reached the editor.
    await tick()
    tourActive.set(false)
    previousFocus?.focus()
  }

  function handleKey(event: KeyboardEvent): void {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      void finish()
    } else if (event.key === 'Tab' && dialog) {
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  onDestroy(() => {
    observer?.disconnect()
    if (original) appState.set(original)
    restoreLayout?.()
    tourActive.set(false)
  })
</script>

<svelte:window on:keydown={handleKey} on:resize={measure} on:scroll={measure} />

{#if error}
  <div class="tour-error" role="alert">
    {error}
    <button type="button" on:click={() => { error = '' }}>Dismiss</button>
  </div>
{/if}

{#if open}
  <div class="tour-blocker" aria-hidden="true"></div>
  <div
    class="tour-highlight"
    aria-hidden="true"
    style={`top:${highlight.top}px;left:${highlight.left}px;width:${highlight.width}px;height:${highlight.height}px;`}
  ></div>
  <div
    bind:this={dialog}
    class="tour-dialog"
    class:tour-right={right}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    aria-describedby="tour-description"
    tabindex="-1"
  >
    <header>
      <span>GUIDED TOUR · {index + 1} / {TOUR_STEPS.length}</span>
      <button type="button" on:click={() => { void finish() }}>Exit tour</button>
    </header>
    <div aria-live="polite" aria-atomic="true">
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-description">{step.text}</p>
    </div>
    <p class="tour-note">5 synthetic series · Your project will be restored</p>
    <footer>
      <button type="button" disabled={index === 0} on:click={() => { void move(-1) }}>Back</button>
      {#if index === TOUR_STEPS.length - 1}
        <button type="button" class="tour-next" on:click={() => { void finish() }}>Finish</button>
      {:else}
        <button type="button" class="tour-next" on:click={() => { void move(1) }}>Next</button>
      {/if}
    </footer>
  </div>
{/if}

<style>
  .tour-blocker { position: fixed; inset: 0; z-index: 2000; }
  .tour-highlight { position: fixed; z-index: 2001; pointer-events: none; border: 2px solid #60a5fa; border-radius: 8px; box-shadow: 0 0 0 9999px rgb(0 0 0 / 55%); box-sizing: border-box; }
  .tour-dialog { position: fixed; z-index: 2002; bottom: 24px; left: 24px; width: min(400px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid #60a5fa; border-radius: 12px; background: #18212f; color: #f1f5f9; box-shadow: 0 12px 40px rgb(0 0 0 / 40%); }
  .tour-right { left: auto; right: 24px; }
  header, footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  header span, .tour-note { font-size: 12px; color: #cbd5e1; }
  h2 { font-size: 21px; margin: 18px 0 10px; }
  p { line-height: 1.6; font-size: 14px; }
  button { padding: 8px 12px; color: inherit; background: #273449; border: 1px solid #64748b; border-radius: 6px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }
  .tour-next { background: #1d4ed8; border-color: #60a5fa; }
  .tour-error { position: fixed; z-index: 2100; bottom: 20px; left: 20px; max-width: calc(100vw - 40px); padding: 16px; background: #7f1d1d; color: white; border-radius: 8px; }
  @media (max-width: 600px) {
    .tour-dialog { bottom: 12px; left: 12px; right: 12px; width: auto; padding: 16px; }
  }
</style>
