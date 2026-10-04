import { describe, expect, it } from 'vitest'
import { rowWindow, scrollToRow } from '../src/lib/workbench/virtualRows'

describe('virtual rows', () => {
  it('renders only the visible slice plus overscan with matching spacers', () => {
    const view = rowWindow(2800, 280, 28, 10_000, 5)
    expect(view).toEqual({ start: 95, end: 116, padTop: 95 * 28, padBottom: (10_000 - 116) * 28 })
  })

  it('clamps at both ends and handles empty tables', () => {
    expect(rowWindow(0, 280, 28, 3, 5)).toEqual({ start: 0, end: 3, padTop: 0, padBottom: 0 })
    expect(rowWindow(0, 280, 28, 0)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })

  it('scrolls a hovered row into view below the sticky header only when needed', () => {
    expect(scrollToRow(5, 0, 300, 28, 30)).toBeNull()
    expect(scrollToRow(2, 280, 300, 28, 30)).toBe(48)
    expect(scrollToRow(20, 0, 300, 28, 30)).toBe(588 - 270 + 8)
  })
})
