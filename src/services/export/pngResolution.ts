import { crc32 } from './zipArchive'

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PHYS_TYPE = new Uint8Array([112, 72, 89, 115])

function chunk(type: Uint8Array, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(new ArrayBuffer(data.length + 12))
  const view = new DataView(output.buffer)
  view.setUint32(0, data.length, false)
  output.set(type, 4)
  output.set(data, 8)
  const crcInput = new Uint8Array(type.length + data.length)
  crcInput.set(type)
  crcInput.set(data, type.length)
  view.setUint32(8 + data.length, crc32(crcInput), false)
  return output
}

export function addPngResolution(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (png.length < 33 || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) {
    throw new Error('The plot renderer returned an invalid PNG file.')
  }
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('PNG resolution must be a positive number.')

  const parts: Uint8Array[] = [PNG_SIGNATURE]
  let offset = PNG_SIGNATURE.length
  let inserted = false
  while (offset + 12 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0, false)
    const end = offset + length + 12
    if (end > png.length) throw new Error('The plot renderer returned a truncated PNG file.')
    const type = png.subarray(offset + 4, offset + 8)
    const isPhys = type.every((byte, index) => byte === PHYS_TYPE[index])
    if (!isPhys) parts.push(png.subarray(offset, end))
    const isHeader = type[0] === 73 && type[1] === 72 && type[2] === 68 && type[3] === 82
    if (isHeader) {
      const pixelsPerMeter = Math.round(dpi / 0.0254)
      const data = new Uint8Array(new ArrayBuffer(9))
      const view = new DataView(data.buffer)
      view.setUint32(0, pixelsPerMeter, false)
      view.setUint32(4, pixelsPerMeter, false)
      data[8] = 1
      parts.push(chunk(PHYS_TYPE, data))
      inserted = true
    }
    offset = end
    if (type[0] === 73 && type[1] === 69 && type[2] === 78 && type[3] === 68) break
  }
  if (!inserted) throw new Error('The plot renderer returned a PNG without an image header.')

  const output = new Uint8Array(new ArrayBuffer(parts.reduce((size, part) => size + part.length, 0)))
  let cursor = 0
  for (const part of parts) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}
