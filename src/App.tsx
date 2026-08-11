import { useState, useRef, useCallback, useEffect } from 'react'
import { allPalettes, type Palette } from './lib/palettes'
import { quantizeImage, type BeadCell } from './lib/colorQuantization'
import { exportPNG, exportPDF } from './lib/export'

const BASE_COLS = 40
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MIN_COLS = 10
const MAX_COLS = 80
const PREVIEW_CELL = 18
const PREVIEW_FONT = 9

function isLight(rgb: [number, number, number]) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 150
}

export default function App() {
  const [palette, setPalette] = useState<Palette>(allPalettes[0])
  const [cols, setCols] = useState(BASE_COLS)
  const [rows, setRows] = useState(BASE_COLS)
  const [beadCells, setBeadCells] = useState<BeadCell[] | null>(null)
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null)
  const [removing, setRemoving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [missingInput, setMissingInput] = useState('')
  const [exportFormat, setExportFormat] = useState<'png' | 'pdf'>('png')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const beadCanvasRef = useRef<HTMLCanvasElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ active: false, sx: 0, sy: 0, px: 0, py: 0 })
  const pinchRef = useRef({ dist: 0, zoom: 1 })
  const pinchRAF = useRef(0)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    setPanX(0)
    setPanY(0)
  }, [beadCells])

  const OVERSHOOT = 80


  const clampPan = useCallback((px: number, py: number, z: number) => {
    const canvas = beadCanvasRef.current
    const container = canvasAreaRef.current
    if (!canvas || !container) return { x: px, y: py }
    const cw = container.clientWidth
    const ch = container.clientHeight
    const ww = canvas.width * z
    const wh = canvas.height * z
    const limitX = Math.max(0, (ww - cw) / 2) + OVERSHOOT
    const limitY = Math.max(0, (wh - ch) / 2) + OVERSHOOT
    return {
      x: Math.max(-limitX, Math.min(limitX, px)),
      y: Math.max(-limitY, Math.min(limitY, py)),
    }
  }, [])

  const snapToBounds = useCallback(() => {
    const canvas = beadCanvasRef.current
    const container = canvasAreaRef.current
    if (!canvas || !container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const ww = canvas.width * zoom
    const wh = canvas.height * zoom
    const limitX = Math.max(0, (ww - cw) / 2)
    const limitY = Math.max(0, (wh - ch) / 2)
    setPanX((px) => Math.max(-limitX, Math.min(limitX, px)))
    setPanY((py) => Math.max(-limitY, Math.min(limitY, py)))
  }, [zoom])

  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
      const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        dragRef.current.active = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), zoom: zoomRef.current }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        if (pinchRAF.current) return
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        pinchRAF.current = requestAnimationFrame(() => {
          pinchRAF.current = 0
        if (pinchRef.current.dist > 0) {
          const scale = dist / pinchRef.current.dist
          setZoom((z) => Math.max(0.3, Math.min(4, pinchRef.current.zoom * scale)))
        }
        })
      } else if (dragRef.current.active && e.touches.length === 1) {
        const t = e.touches[0]
        const rawX = dragRef.current.px + (t.clientX - dragRef.current.sx)
        const rawY = dragRef.current.py + (t.clientY - dragRef.current.sy)
        const curZoom = zoomRef.current
        const clamped = clampPan(rawX, rawY, curZoom)
        setPanX(clamped.x)
        setPanY(clamped.y)
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [clampPan])
  useEffect(() => {
    if (!sourceImage || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = sourceImage.width
    canvas.height = sourceImage.height
    ctx.drawImage(sourceImage, 0, 0)
  }, [sourceImage])

  useEffect(() => {
    if (!beadCells || !beadCanvasRef.current) return
    const canvas = beadCanvasRef.current
    const cellSize = PREVIEW_CELL
    const fontSize = PREVIEW_FONT
    const colCount = beadCells.length > 0 ? Math.max(...beadCells.map((c) => c.col)) + 1 : 0
    const rowCount = beadCells.length > 0 ? Math.max(...beadCells.map((c) => c.row)) + 1 : 0

    const padding = 1
    canvas.width = colCount * cellSize + padding * 2
    canvas.height = rowCount * cellSize + padding * 2

    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#d8d8d8'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= rowCount; r++) {
      ctx.beginPath()
      ctx.moveTo(padding, r * cellSize + padding)
      ctx.lineTo(colCount * cellSize + padding, r * cellSize + padding)
      ctx.stroke()
    }
    for (let c = 0; c <= colCount; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cellSize + padding, padding)
      ctx.lineTo(c * cellSize + padding, rowCount * cellSize + padding)
      ctx.stroke()
    }

    ctx.font = `600 ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (const cell of beadCells) {
      const x = cell.col * cellSize + padding
      const y = cell.row * cellSize + padding

      if (!cell.bead) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1)
        continue
      }

      const [r, g, b] = cell.bead.rgb
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1)
      ctx.fillStyle = isLight(cell.bead.rgb) ? '#1a1a1a' : '#ffffff'
      const f = cellSize > 14 ? fontSize : Math.max(6, cellSize * 0.45)
      ctx.font = `600 ${f}px monospace`
      ctx.fillText(cell.bead.code, x + cellSize / 2, y + cellSize / 2)
    }
  }, [beadCells])

  const getImageData = useCallback((img: HTMLImageElement): ImageData => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, img.width, img.height)
  }, [])

  const parseMissingCodes = useCallback((input: string): Set<string> => {
    const codes = new Set<string>()
    const tokens = input.split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      const m = token.match(/^([A-Za-z]{1,2})(\d{1,2})$/)
      if (m) {
        const letter = m[1].toUpperCase()
        const num = m[2]
        const code = letter + num
        if (palette.colors.some((c) => c.code.toUpperCase() === code)) {
          codes.add(code)
        }
      }
    }
    return codes
  }, [palette])

  const missingColors = parseMissingCodes(missingInput)

  const handleMissingInputChange = useCallback(
    (value: string) => {
      setMissingInput(value)
      if (processedImageData) {
        const codes = parseMissingCodes(value)
        const activePalette: Palette = {
          ...palette,
          colors: palette.colors.filter((c) => !codes.has(c.code.toUpperCase())),
        }
        setBeadCells(quantizeImage(processedImageData, activePalette, cols, rows))
      }
    },
    [processedImageData, palette, cols, rows, parseMissingCodes],
  )

  const resetMissingColors = useCallback(() => {
    setMissingInput('')
    if (processedImageData) {
      setBeadCells(quantizeImage(processedImageData, palette, cols, rows))
    }
  }, [processedImageData, palette, cols, rows])

  const runQuantization = useCallback(
    (imageData: ImageData, overrideCols?: number) => {
      setProcessing(true)
      requestAnimationFrame(() => {
        let targetCols = overrideCols ?? cols
        let targetRows = rows
        if (!overrideCols) {
          const aspect = imageData.width / imageData.height
          if (aspect >= 1) {
            targetCols = BASE_COLS
            targetRows = Math.round(BASE_COLS / aspect)
          } else {
            targetRows = BASE_COLS
            targetCols = Math.round(BASE_COLS * aspect)
          }
          setCols(targetCols)
          setRows(targetRows)
        } else if (overrideCols) {
          const aspect = imageData.width / imageData.height
          setCols(overrideCols)
          const tr = Math.round(overrideCols / aspect)
          setRows(tr)
          targetRows = tr
        }
        const activePalette: Palette = {
          ...palette,
          colors: palette.colors.filter((c) => !parseMissingCodes(missingInput).has(c.code.toUpperCase())),
        }
        if (activePalette.colors.length === 0) {
          setProcessing(false)
          setError('所有色号均被排除，请减少缺色数量')
          return
        }
        const cells = quantizeImage(imageData, activePalette, targetCols, targetRows)
        setBeadCells(cells)
        setProcessing(false)
        setPanX(0)
        setPanY(0)
        setZoom(1)
      })
    },
    [cols, rows, palette, missingInput, parseMissingCodes],
  )

  const handleImageUpload = useCallback(
    (file: File) => {
      setError(null)
      setBeadCells(null)
      setProcessedImageData(null)
      if (file.size > MAX_FILE_SIZE) {
        setError('图片文件过大，请使用 20MB 以内的图片')
        return
      }

      const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif']
      if (!validTypes.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|bmp|gif)$/i)) {
        setError('不支持的图片格式')
        return
      }

      const reader = new FileReader()
      reader.onerror = () => setError('文件读取失败')
      reader.onload = (e) => {
        const img = new Image()
        img.onerror = () => setError('图片无法解析')
        img.onload = () => {
          setSourceImage(img)
          const imgData = getImageData(img)
          setProcessedImageData(imgData)
          runQuantization(imgData)
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    },
    [getImageData, runQuantization],
  )

  const handleRemoveBackground = useCallback(async () => {
    if (!sourceImage) return
    setRemoving(true)
    setError(null)

    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const canvas = document.createElement('canvas')
      canvas.width = sourceImage.width
      canvas.height = sourceImage.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(sourceImage, 0, 0)
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      )
      const resultBlob = await removeBackground(blob)
      const url = URL.createObjectURL(resultBlob)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const imgData = getImageData(img)
        setProcessedImageData(imgData)
        runQuantization(imgData)
        setRemoving(false)
      }
      img.src = url
    } catch (e: any) {
      setError('AI 抠图失败：' + (e.message || '未知错误'))
      setError('AI 抠图失败，请重试')
      setRemoving(false)
    }
  }, [sourceImage, getImageData, runQuantization])

  const handleClarityChange = useCallback(
    (newCols: number) => {
      if (processedImageData) {
        runQuantization(processedImageData, newCols)
      }
    },
    [processedImageData, runQuantization],
  )

  const handlePaletteChange = useCallback(
    (paletteId: string) => {
      const newPalette = allPalettes.find((p) => p.id === paletteId)
      if (!newPalette) return
      setPalette(newPalette)
      if (processedImageData) {
        const codes = parseMissingCodes(missingInput)
        const p: Palette = { ...newPalette, colors: newPalette.colors.filter((c) => !codes.has(c.code.toUpperCase())) }
        setBeadCells(quantizeImage(processedImageData, p, cols, rows))
      }
    },
    [processedImageData, cols, rows, missingInput, parseMissingCodes],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleImageUpload(file)
    },
    [handleImageUpload],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY }
  }, [panX, panY])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return
    const rawX = dragRef.current.px + (e.clientX - dragRef.current.sx)
    const rawY = dragRef.current.py + (e.clientY - dragRef.current.sy)
    const clamped = clampPan(rawX, rawY, zoom)
    setPanX(clamped.x)
    setPanY(clamped.y)
  }, [zoom])

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false
    snapToBounds()
  }, [snapToBounds])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    dragRef.current = { active: true, sx: t.clientX, sy: t.clientY, px: panX, py: panY }
  }, [panX, panY])

  const handleTouchEnd = useCallback(() => {
    dragRef.current.active = false
    snapToBounds()
  }, [snapToBounds])

  const beadCols = beadCells ? Math.max(...beadCells.map((c) => c.col)) + 1 : 0
  const beadRows = beadCells ? Math.max(...beadCells.map((c) => c.row)) + 1 : 0

  const clarityPercent = Math.max(1, Math.round(((cols - MIN_COLS) / (MAX_COLS - MIN_COLS)) * 100))

  return (
    <div style={styles.root}>
      {}
      <header className="app-header" style={styles.header}>
        <h1 className="app-title" style={styles.title}>PixelBead</h1>
        <span style={styles.subtitle}>by cannolu</span>
      </header>

      {}
      <div className="app-body" style={styles.body}>
        {}
        <aside className="side-panel" style={styles.panel}>
          {}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>图片</h3>
            <div
              className="drop-zone"
              style={{
                ...styles.dropZone,
                ...(sourceImage ? styles.dropZoneHasImage : {}),
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              {sourceImage ? (
                <canvas
                  ref={previewCanvasRef}
                  style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 4 }}
                />
              ) : (
                <div style={styles.dropText}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 6 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span>拖放或点击上传</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    PNG / JPEG / WebP / GIF
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
              />
            </div>

            {sourceImage && (
              <button
                style={{
                  ...styles.btn,
                  ...styles.btnPrimary,
                  width: '100%',
                  marginTop: 8,
                  opacity: removing ? 0.6 : 1,
                }}
                disabled={removing}
                onClick={handleRemoveBackground}
              >
                {removing ? 'Processing...' : 'Background Removal'}
              </button>
            )}

            {error && <div style={styles.error}>{error}</div>}
          </section>

          {}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>色板</h3>
            <select
              style={styles.select}
              value={palette.id}
              onChange={(e) => handlePaletteChange(e.target.value)}
            >
              {allPalettes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </section>

          {}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>图纸清晰度</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>粗</span>
              <input
                type="range"
                min={MIN_COLS}
                max={MAX_COLS}
                value={cols}
                style={styles.range}
                onChange={(e) => handleClarityChange(parseInt(e.target.value))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>细</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
              约 {clarityPercent}% · {cols} 豆宽
            </div>
          </section>

          {}
          {sourceImage && beadCells && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>
                缺少色号
                {missingColors.size > 0 && (
                  <span style={{ color: 'var(--danger)', marginLeft: 4 }}>（已排除 {missingColors.size} 色）</span>
                )}
              </h3>
              <input
                type="text"
                value={missingInput}
                onChange={(e) => handleMissingInputChange(e.target.value)}
                placeholder="例：A1 B3 C12"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                多个色号间通过空格隔开，大小写兼容，动态更新
              </div>
              {missingColors.size > 0 && (
                <button
                  style={{ ...styles.btn, ...styles.btnOutline, width: '100%', marginTop: 6, fontSize: 11, padding: '4px 8px' }}
                  onClick={resetMissingColors}
                >
                  重置缺色
                </button>
              )}
            </section>
          )}

          {}
          {beadCells && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>导出</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'png' | 'pdf')}
                  style={{ ...styles.select, flex: 1 }}
                >
                  <option value="png">PNG 图片</option>
                  <option value="pdf">PDF 文档</option>
                </select>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  onClick={() => exportFormat === 'pdf' ? exportPDF(beadCells, beadCols, beadRows, palette) : exportPNG(beadCells, beadCols, beadRows, palette)}
                >
                  导出
                </button>
              </div>
            </section>
          )}

          {}
          {beadCells && (
            <section style={styles.section}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>图纸尺寸</span>
                <span style={styles.infoValue}>{beadCols} × {beadRows} 豆</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>总计</span>
                <span style={styles.infoValue}>{beadCols * beadRows} 粒</span>
              </div>
            </section>
          )}
        </aside>

        {}
        <main
          className="canvas-area"
          ref={canvasAreaRef}
          style={{ ...styles.canvasArea, cursor: beadCells ? 'grab' : 'default' }}
          onMouseDown={beadCells ? handleMouseDown : undefined}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={beadCells ? handleTouchStart : undefined}
          onTouchEnd={handleTouchEnd}
        >
          {processing ? (
            <div style={styles.placeholder}>
              <div style={styles.spinner} />
              <span style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: 13 }}>生成中...</span>
            </div>
          ) : beadCells ? (
            <div ref={wrapperRef} style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: 'center center', transition: dragRef.current.active ? 'none' : 'transform 0.3s ease-out' }}>
              <canvas ref={beadCanvasRef} style={{ display: 'block' }} />
            </div>
          ) : (
            <div style={styles.placeholder}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.25 }}>
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <line x1="2" y1="6" x2="22" y2="6" />
                <line x1="6" y1="2" x2="6" y2="22" />
              </svg>
              <span style={{ color: 'var(--text-muted)', marginTop: 10, fontSize: 13 }}>上传图片以生成图纸</span>
            </div>
          )}
        </main>
      </div>

      {}
      {beadCells && (
        <div style={styles.zoomBar}>
          <button style={styles.zoomBtn} onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} title="缩小">−</button>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 42, textAlign: 'center', userSelect: 'none' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button style={styles.zoomBtn} onClick={() => setZoom((z) => Math.min(4, z + 0.1))} title="放大">+</button>
          <button style={{ ...styles.zoomBtn, width: 36, fontSize: 10 }} onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} title="重置">1:1</button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '10px 18px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  panel: {
    width: 260,
    minWidth: 260,
    overflowY: 'auto',
    padding: 14,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text-muted)',
    marginBottom: 6,
  },
  dropZone: {
    border: '2px dashed var(--border)',
    borderRadius: 'var(--radius)',
    padding: 12,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    background: 'var(--bg-primary)',
    minHeight: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneHasImage: { padding: 3 },
  dropText: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    color: 'var(--text-secondary)', fontSize: 12, gap: 0,
  },
  select: {
    width: '100%', padding: '7px 8px', backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none', cursor: 'pointer',
  },
  btn: {
    padding: '7px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
    fontWeight: 500, transition: 'all 0.15s', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  btnPrimary: { background: 'var(--accent)', color: '#fff' },
  btnOutline: { background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 },
  infoLabel: { color: 'var(--text-muted)' },
  infoValue: { color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'monospace' },
  canvasArea: {
    flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  placeholder: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', width: '100%',
  },
  spinner: {
    width: 28, height: 28, border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
  range: {
    flex: 1, height: 4, WebkitAppearance: 'none',
    background: 'var(--border)', borderRadius: 2, outline: 'none', cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  zoomBar: {
    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 3,
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '3px 6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 100,
  },
  zoomBtn: {
    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: 'var(--text-secondary)', border: 'none',
    borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  error: {
    marginTop: 6, padding: '6px 8px', background: 'rgba(240, 71, 112, 0.12)',
    border: '1px solid rgba(240, 71, 112, 0.25)', borderRadius: 'var(--radius-sm)',
    color: '#f04770', fontSize: 11,
  },
}
