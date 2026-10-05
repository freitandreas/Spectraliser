import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import ImportWizard from '../src/lib/ImportWizard.svelte'
import { detectDelimitedFormat } from '../src/services/import/importWizard'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('delimiter detection', () => {
  it.each([',', ';', '\t', '|'] as const)('detects %j from numeric rows after metadata', (delimiter) => {
    expect(detectDelimitedFormat(`Instrument: demo\r\nx${delimiter}y\r\n200${delimiter}0.2\r\n201${delimiter}0.3`))
      .toEqual({ delimiter, decimalSeparator: '.' })
  })

  it('distinguishes decimal commas from separators without a header', () => {
    expect(detectDelimitedFormat('200,5;0,2\n201,5;0,3\n')).toEqual({ delimiter: ';', decimalSeparator: ',' })
  })

  it('ignores punctuation inside quoted fields', () => {
    expect(detectDelimitedFormat('"x, wavelength";"y, intensity"\n200;0.2\n201;0.3'))
      .toEqual({ delimiter: ';', decimalSeparator: '.' })
  })

  it('uses the existing default when there is no delimiter evidence', () => {
    expect(detectDelimitedFormat('\nmetadata\n')).toEqual({ delimiter: ',', decimalSeparator: '.' })
  })

  it('selects the detected format on opening and allows manual overrides until reopening', async () => {
    const file = new File(['x;y\n200;0,2\n201;0,3'], 'spectrum.csv')
    Object.defineProperty(file, 'text', { value: async () => 'x;y\n200;0,2\n201;0,3' })
    const view = render(ImportWizard, { open: true, files: [file] })
    const delimiter = view.getByLabelText('Delimiter') as HTMLSelectElement
    await waitFor(() => expect(delimiter.value).toBe(';'))
    expect((view.getByLabelText('Decimal Separator') as HTMLSelectElement).value).toBe(',')
    await fireEvent.change(delimiter, { target: { value: '|' } })
    await waitFor(() => expect(delimiter.value).toBe('|'))
    await view.rerender({ open: false, files: [file] })
    await view.rerender({ open: true, files: [file] })
    await waitFor(() => expect((view.getByLabelText('Delimiter') as HTMLSelectElement).value).toBe(';'))
  })

  it.each([',', ';', '\t', '|'] as const)('selects %j in the wizard and renders a two-column preview', async (delimiter) => {
    const text = `x${delimiter}y\n200${delimiter}0.2\n201${delimiter}0.3`
    const file = new File([text], 'spectrum.txt')
    Object.defineProperty(file, 'text', { value: async () => text })
    const view = render(ImportWizard, { open: true, files: [file] })
    await waitFor(() => expect((view.getByLabelText('Delimiter') as HTMLSelectElement).value).toBe(delimiter))
    await waitFor(() => expect(view.getByLabelText('Series 1 name')).toBeTruthy())
    expect(view.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['x', 'y', '200', '0.2', '201', '0.3'])
    await waitFor(() => expect(view.getByRole('button', { name: 'Import Files' }).hasAttribute('disabled')).toBe(false))
  })
})
