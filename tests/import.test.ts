import { describe, expect, it } from 'vitest'
import { parseDelimited } from '../src/services/import/parsers'

describe('parseDelimited', () => {
  it('respects start row and header', () => {
    const result = parseDelimited('x,y\nheader,header\n200,0.1\n201,0.2\n', {
      delimiter: ',',
      decimalSeparator: '.',
      startRow: 1,
      hasHeader: true,
      xColumn: 0,
      yColumn: 1,
    })

    expect(result.abscissa).toEqual([200, 201])
    expect(result.ordinate).toEqual([0.1, 0.2])
  })

  it('parses comma decimals when configured', () => {
    const result = parseDelimited('200;0,55\n201;0,65\n', {
      delimiter: ';',
      decimalSeparator: ',',
      startRow: 0,
      hasHeader: false,
      xColumn: 0,
      yColumn: 1,
    })

    expect(result.ordinate).toEqual([0.55, 0.65])
  })
})
