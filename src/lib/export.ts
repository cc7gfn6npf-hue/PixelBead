import type { BeadCell } from './colorQuantization'
import type { Palette } from './palettes'

const CELL_SIZE = 24
const FONT_SIZE = 12

function isLightColor(rgb: [number, number, number]): boolean {
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
  return luminance > 150
}

function renderBeadGridToCanvas(
  cells: BeadCell[],
  cols: number,
  rows: number,
  palette: Palette,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = cols * CELL_SIZE + 2
  canvas.height = rows * CELL_SIZE + 2
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 0.5
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath()
    ctx.moveTo(1, r * CELL_SIZE + 1)
    ctx.lineTo(cols * CELL_SIZE + 1, r * CELL_SIZE + 1)
    ctx.stroke()
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath()
    ctx.moveTo(c * CELL_SIZE + 1, 1)
    ctx.lineTo(c * CELL_SIZE + 1, rows * CELL_SIZE + 1)
    ctx.stroke()
  }

  ctx.font = `bold ${FONT_SIZE}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const cell of cells) {
    if (!cell.bead) continue
    const x = cell.col * CELL_SIZE + 1
    const y = cell.row * CELL_SIZE + 1
    const [r, g, b] = cell.bead.rgb
    const fillColor = `rgb(${r},${g},${b})`

    ctx.fillStyle = fillColor
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2)

    ctx.fillStyle = isLightColor(cell.bead.rgb) ? '#1a1a1a' : '#ffffff'
    ctx.fillText(cell.bead.code, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
  }

  return canvas
}

export function exportPNG(
  cells: BeadCell[],
  cols: number,
  rows: number,
  palette: Palette,
): void {
  const canvas = renderBeadGridToCanvas(cells, cols, rows, palette)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bead-pattern-${cols}x${rows}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

export async function exportPDF(
  cells: BeadCell[],
  cols: number,
  rows: number,
  palette: Palette,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const canvas = renderBeadGridToCanvas(cells, cols, rows, palette)
  const imgData = canvas.toDataURL('image/png')

  const maxWidth = 190
  const maxHeight = 277
  const canvasAspect = canvas.width / canvas.height

  let pdfWidth = maxWidth
  let pdfHeight = maxWidth / canvasAspect
  if (pdfHeight > maxHeight) {
    pdfHeight = maxHeight
    pdfWidth = maxHeight * canvasAspect
  }

  const doc = new jsPDF('p', 'mm', 'a4')
  const x = (210 - pdfWidth) / 2
  const y = (297 - pdfHeight) / 2
  doc.addImage(imgData, 'PNG', x, y, pdfWidth, pdfHeight)
  doc.save(`bead-pattern-${cols}x${rows}.pdf`)
}
