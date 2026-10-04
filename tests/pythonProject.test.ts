import { describe, expect, it } from 'vitest'
import { crc32, createZip } from '../src/services/export/zipArchive'
import { pythonProjectEntries, sampleCsv } from '../src/services/export/pythonProject'
import type { AppState } from '../src/types/project'
import { buildDataset } from './fixtures'

describe('zip archive', () => {
  it('computes standard CRC-32 and writes a valid stored archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const zip = createZip([{ path: 'a.txt', content: 'hello' }, { path: 'data/b.csv', content: 'x,y\n' }])
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    expect(createZip([{ path: 'a', content: 'b' }])).toEqual(createZip([{ path: 'a', content: 'b' }]))
  })
})

describe('python project export', () => {
  it('exports the current editor scripts, samples.json and imported measurements', () => {
    const dataset = buildDataset({ units: { x: 'nm', y: '', xQuantity: 'Wavelength', yQuantity: 'Absorbance' } })
    const state = {
      datasets: [dataset, buildDataset({ id: 'sample-2' })],
      generatedScript: 'generated',
      userScriptOverride: 'edited main',
      pythonFileOverrides: { 'main.py': 'edited main', 'processing.py': '# edited processing' },
    } as unknown as AppState
    const entries = Object.fromEntries(pythonProjectEntries(state).map((entry) => [entry.path, entry.content]))
    expect(entries['main.py']).toBe('edited main')
    expect(entries['processing.py']).toBe('# edited processing')
    const samples = JSON.parse(entries['samples.json'] as string)
    expect(samples.map((sample: { dataFile: string }) => sample.dataFile)).toEqual([
      'data/Sample_01_Processed_.csv',
      'data/Sample_01_Processed__2.csv',
    ])
    expect(entries['data/Sample_01_Processed_.csv']).toBe(sampleCsv(dataset))
    expect(sampleCsv(dataset)).toBe('Wavelength / nm,Absorbance\n200,0.1\n201,0.2\n')
  })
})
