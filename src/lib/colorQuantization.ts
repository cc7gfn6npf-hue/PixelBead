import type { BeadColor, Palette } from './palettes'

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

function weightedDistance(a: [number, number, number], b: [number, number, number]): number {
  const rMean = (a[0] + b[0]) / 2
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return (
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  )
}

export function findClosestBead(color: [number, number, number], palette: Palette): BeadColor {
  let best = palette.colors[0]
  let bestDist = Infinity
  for (const bead of palette.colors) {
    const dist = weightedDistance(color, bead.rgb)
    if (dist < bestDist) {
      bestDist = dist
      best = bead
    }
  }
  return best
}

export interface BeadCell {
  row: number
  col: number
  bead: BeadColor | null
}

export function quantizeImage(
  imageData: ImageData,
  palette: Palette,
  targetCols: number,
  targetRows: number,
): BeadCell[] {
  const { data, width, height } = imageData
  const cellW = width / targetCols
  const cellH = height / targetRows
  const results: BeadCell[] = []

  for (let row = 0; row < targetRows; row++) {
    for (let col = 0; col < targetCols; col++) {
      const startX = Math.floor(col * cellW)
      const startY = Math.floor(row * cellH)
      const endX = Math.floor((col + 1) * cellW)
      const endY = Math.floor((row + 1) * cellH)

      let rSum = 0, gSum = 0, bSum = 0, count = 0

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4
          if (data[idx + 3] < 128) continue
          rSum += data[idx]
          gSum += data[idx + 1]
          bSum += data[idx + 2]
          count++
        }
      }

      if (count === 0) {
        results.push({ row, col, bead: null })
        continue
      }

      const avgColor: [number, number, number] = [
        Math.round(rSum / count),
        Math.round(gSum / count),
        Math.round(bSum / count),
      ]
      const bead = findClosestBead(avgColor, palette)
      results.push({ row, col, bead })
    }
  }

  return results
}
