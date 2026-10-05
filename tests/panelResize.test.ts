import { describe, expect, it, vi } from 'vitest'
import { createPanelResizer, beginResize, resolveResize } from '../src/lib/workbench/panelResize'

describe('panel resizing', () => {
  it('preserves bounds for each panel', () => {
    const sizes = { left: 260, right: 320, bottom: 300 }
    const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    const move = new MouseEvent('mousemove', { clientX: 1000, clientY: 1000 })
    const limits = { layoutWidth: 1320, mainHeight: 600 }
    expect(resolveResize(beginResize('left', event, sizes), move, sizes, limits).left).toBe(540)
    expect(resolveResize(beginResize('right', event, sizes), move, sizes, limits).right).toBe(240)
    expect(resolveResize(beginResize('bottom', event, sizes), move, sizes, limits).bottom).toBe(180)
  })

  it('applies sizes while dragging and releases listeners on stop', () => {
    const apply = vi.fn()
    const resizer = createPanelResizer(
      () => ({ left: 260, right: 320, bottom: 300 }),
      () => ({ layoutWidth: 1320, mainHeight: 600 }),
      apply,
    )
    resizer.start('left', new MouseEvent('mousedown', { clientX: 100 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120 }))
    expect(apply).toHaveBeenLastCalledWith({ left: 280, right: 320, bottom: 300 })
    window.dispatchEvent(new MouseEvent('mouseup'))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }))
    expect(apply).toHaveBeenCalledOnce()
  })

  it('restores existing body styles and supports explicit cleanup', () => {
    document.body.style.cursor = 'help'
    document.body.style.userSelect = 'text'
    const resizer = createPanelResizer(
      () => ({ left: 260, right: 320, bottom: 300 }),
      () => ({ layoutWidth: 1320, mainHeight: 600 }),
      vi.fn(),
    )
    resizer.start('bottom', new MouseEvent('mousedown'))
    expect(document.body.style.cursor).toBe('row-resize')
    resizer.stop()
    expect(document.body.style.cursor).toBe('help')
    expect(document.body.style.userSelect).toBe('text')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })
})
