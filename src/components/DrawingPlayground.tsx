import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  parseSvgOrigin,
  parseSvgViewBox,
  type SvgViewBox,
} from '../lib/prepare-svg'
import type { ParseResult, RegionBox } from '../lib/types'
import './DrawingPlayground.css'

type Props = {
  result: ParseResult
  hiddenLayers: string[]
  region: RegionBox | null
  onHiddenLayersChange: (layers: string[]) => void
  onRegionChange: (region: RegionBox | null) => void
  onClose: () => void
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Map CAD world (+Y up) into normalized SVG local space (Y already flipped in file). */
function worldToLocal(
  x: number,
  y: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  return { x: x - origin.x, y: -y - origin.y }
}

function localToWorld(
  x: number,
  y: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  return { x: x + origin.x, y: -(y + origin.y) }
}

export function DrawingPlayground({
  result,
  hiddenLayers,
  region,
  onHiddenLayersChange,
  onRegionChange,
  onClose,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const origin = useMemo(() => parseSvgOrigin(result.svg), [result.svg])

  // Camera lives in normalized/local SVG space (near 0,0) for crisp text.
  const world = useMemo(() => {
    const w = Number(result.svg.match(/data-world-width="([^"]+)"/)?.[1])
    const h = Number(result.svg.match(/data-world-height="([^"]+)"/)?.[1])
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { minX: 0, minY: 0, width: w, height: h }
    }
    return parseSvgViewBox(result.svg)
  }, [result.svg])

  const [camera, setCamera] = useState<SvgViewBox | null>(null)
  const cameraRef = useRef<SvgViewBox | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [draftScreen, setDraftScreen] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const dragRef = useRef<{
    mode: 'pan' | 'select'
    x: number
    y: number
    camera: SvgViewBox
  } | null>(null)
  const [layerQuery, setLayerQuery] = useState('')
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })

  cameraRef.current = camera
  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setViewportSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [result.svg])

  const layerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of result.rows) {
      counts.set(row.layer, (counts.get(row.layer) ?? 0) + 1)
    }
    return counts
  }, [result.rows])

  const layers = useMemo(() => {
    return [...result.layers]
      .sort((a, b) => {
        if (a.likelyAnswer !== b.likelyAnswer) return a.likelyAnswer ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((layer) => ({
        ...layer,
        count: layerCounts.get(layer.name) ?? layer.entityCount,
      }))
  }, [result.layers, layerCounts])

  const filteredLayers = useMemo(() => {
    const q = layerQuery.trim().toLowerCase()
    if (!q) return layers
    return layers.filter((layer) => layer.name.toLowerCase().includes(q))
  }, [layers, layerQuery])

  const selectedLayerInfo = selectedLayer
    ? (result.layers.find((l) => l.name === selectedLayer) ?? null)
    : null

  const hideCss = useMemo(() => {
    if (hiddenLayers.length === 0) return ''
    return hiddenLayers
      .map((name) => {
        const safe = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        return `.playground-stage g[data-layer="${safe}"]{display:none!important;}`
      })
      .join('\n')
  }, [hiddenLayers])

  const svgHtml = useMemo(() => {
    if (!camera) return result.svg
    const vb = `${camera.minX} ${camera.minY} ${camera.width} ${camera.height}`
    let html = result.svg
      .replace(/\swidth="[^"]*"/gi, '')
      .replace(/\sheight="[^"]*"/gi, '')
      .replace(/\spreserveAspectRatio="[^"]*"/gi, '')
    if (/viewBox="/i.test(html)) {
      html = html.replace(/viewBox="[^"]*"/i, `viewBox="${vb}"`)
    } else {
      html = html.replace('<svg', `<svg viewBox="${vb}"`)
    }
    return html.replace(
      /<svg\b/i,
      '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"',
    )
  }, [result.svg, camera])

  const labels = useMemo(() => {
    if (!showLabels || !camera || !world) return []
    const vw = viewportSize.w
    const vh = viewportSize.h
    if (vw <= 0 || vh <= 0) return []
    // HTML labels appear once zoomed in enough (Autodesk-like readable text).
    if (camera.width > world.width * 0.45) return []

    const items: Array<{
      key: string
      text: string
      left: number
      top: number
      layer: string
    }> = []

    for (const item of result.textItems) {
      if (!item.text || item.x == null || item.y == null) continue
      if (hiddenSet.has(item.layer)) continue
      const local = worldToLocal(item.x, item.y, origin)
      if (
        local.x < camera.minX ||
        local.x > camera.minX + camera.width ||
        local.y < camera.minY ||
        local.y > camera.minY + camera.height
      ) {
        continue
      }
      const left = ((local.x - camera.minX) / camera.width) * vw
      const top = ((local.y - camera.minY) / camera.height) * vh
      items.push({
        key: `${item.handle}-${item.text}`,
        text: item.text,
        left,
        top,
        layer: item.layer,
      })
      if (items.length >= 800) break
    }
    return items
  }, [showLabels, camera, world, result.textItems, hiddenSet, origin, viewportSize])

  function fitHeight() {
    if (!world) return
    const viewport = viewportRef.current
    const aspect =
      viewport && viewport.clientHeight > 0
        ? viewport.clientWidth / viewport.clientHeight
        : 16 / 9
    const height = world.height * 1.08
    const width = height * aspect
    setCamera({
      minX: world.minX,
      minY: world.minY - world.height * 0.04,
      width,
      height,
    })
  }

  function fitAll() {
    if (!world) return
    setCamera({ ...world })
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const viewport = viewportRef.current
    const current = cameraRef.current
    if (!viewport || !current || !world) return

    const rect = viewport.getBoundingClientRect()
    const px = (clientX - rect.left) / rect.width
    const py = (clientY - rect.top) / rect.height
    const worldX = current.minX + px * current.width
    const worldY = current.minY + py * current.height

    const nextWidth = clamp(
      current.width * factor,
      world.width * 0.0002,
      world.width * 8,
    )
    const nextHeight = nextWidth / (current.width / current.height)

    setCamera({
      minX: worldX - px * nextWidth,
      minY: worldY - py * nextHeight,
      width: nextWidth,
      height: nextHeight,
    })
  }

  function zoomBy(factor: number) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  function screenToLocal(clientX: number, clientY: number) {
    const viewport = viewportRef.current
    const current = cameraRef.current
    if (!viewport || !current) return null
    const rect = viewport.getBoundingClientRect()
    const px = (clientX - rect.left) / rect.width
    const py = (clientY - rect.top) / rect.height
    return {
      x: current.minX + px * current.width,
      y: current.minY + py * current.height,
    }
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') zoomBy(1 / 1.2)
      if (e.key === '-' || e.key === '_') zoomBy(1.2)
      if (e.key === '0') fitHeight()
      if (e.key === '1') fitAll()
    }

    window.addEventListener('keydown', onKey)
    const id = window.setTimeout(() => fitHeight(), 30)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(id)
    }
  }, [result.svg, onClose, world])

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    zoomAt(e.clientX, e.clientY, factor)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !cameraRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const mode = selectMode ? 'select' : 'pan'
    setDragging(true)
    dragRef.current = {
      mode,
      x: e.clientX,
      y: e.clientY,
      camera: { ...cameraRef.current },
    }
    if (mode === 'select') {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setDraftScreen({ x0: x, y0: y, x1: x, y1: y })
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const viewport = viewportRef.current
    if (!drag || !viewport) return

    if (drag.mode === 'select') {
      const rect = viewport.getBoundingClientRect()
      setDraftScreen((prev) =>
        prev
          ? {
              ...prev,
              x1: e.clientX - rect.left,
              y1: e.clientY - rect.top,
            }
          : prev,
      )
      return
    }

    const rect = viewport.getBoundingClientRect()
    const dxPx = e.clientX - drag.x
    const dyPx = e.clientY - drag.y
    const dx = (-dxPx / rect.width) * drag.camera.width
    const dy = (-dyPx / rect.height) * drag.camera.height
    setCamera({
      ...drag.camera,
      minX: drag.camera.minX + dx,
      minY: drag.camera.minY + dy,
    })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag?.mode === 'select' && draftScreen) {
      const rect = e.currentTarget.getBoundingClientRect()
      const a = screenToLocal(
        rect.left + Math.min(draftScreen.x0, draftScreen.x1),
        rect.top + Math.min(draftScreen.y0, draftScreen.y1),
      )
      const b = screenToLocal(
        rect.left + Math.max(draftScreen.x0, draftScreen.x1),
        rect.top + Math.max(draftScreen.y0, draftScreen.y1),
      )
      if (a && b && Math.abs(draftScreen.x1 - draftScreen.x0) > 8) {
        const wa = localToWorld(a.x, a.y, origin)
        const wb = localToWorld(b.x, b.y, origin)
        onRegionChange({
          minX: Math.min(wa.x, wb.x),
          minY: Math.min(wa.y, wb.y),
          maxX: Math.max(wa.x, wb.x),
          maxY: Math.max(wa.y, wb.y),
        })
        setSelectMode(false)
      }
      setDraftScreen(null)
    }

    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }

  function toggleLayer(name: string) {
    if (hiddenSet.has(name)) {
      onHiddenLayersChange(hiddenLayers.filter((l) => l !== name))
    } else {
      onHiddenLayersChange([...hiddenLayers, name])
    }
  }

  const zoomPercent =
    world && camera ? Math.round((world.width / camera.width) * 100) : 100

  const regionOverlay = useMemo(() => {
    if (!region || !camera || !viewportRef.current) return null
    const a = worldToLocal(region.minX, region.minY, origin)
    const b = worldToLocal(region.maxX, region.maxY, origin)
    const vw = viewportRef.current.clientWidth
    const vh = viewportRef.current.clientHeight
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return {
      left: ((minX - camera.minX) / camera.width) * vw,
      top: ((minY - camera.minY) / camera.height) * vh,
      width: ((maxX - minX) / camera.width) * vw,
      height: ((maxY - minY) / camera.height) * vh,
    }
  }, [region, camera, origin])

  return (
    <div className="playground" role="dialog" aria-modal="true" aria-label="Drawing playground">
      <header className="playground-top">
        <div>
          <h2>Drawing playground</h2>
          <div className="meta">
            {result.fileName} · {result.entityCount} entities · {layers.length} layers ·{' '}
            {zoomPercent}%
            {region ? ' · region selected' : ''}
          </div>
        </div>
        <div className="playground-actions">
          <button
            type="button"
            className={`playground-btn ${showLabels ? 'primary' : ''}`}
            onClick={() => setShowLabels((v) => !v)}
          >
            {showLabels ? 'Labels on' : 'Labels off'}
          </button>
          <button
            type="button"
            className={`playground-btn ${selectMode ? 'primary' : ''}`}
            onClick={() => setSelectMode((v) => !v)}
          >
            {selectMode ? 'Selecting…' : 'Select region'}
          </button>
          <button
            type="button"
            className="playground-btn"
            disabled={!region}
            onClick={() => onRegionChange(null)}
          >
            Clear region
          </button>
          <button type="button" className="playground-btn" onClick={() => zoomBy(1 / 1.25)}>
            Zoom in
          </button>
          <button type="button" className="playground-btn" onClick={() => zoomBy(1.25)}>
            Zoom out
          </button>
          <button type="button" className="playground-btn primary" onClick={fitHeight}>
            Fit height
          </button>
          <button type="button" className="playground-btn danger" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="playground-body">
        <aside className="playground-sidebar">
          <div className="playground-sidebar-header">
            <h3>Layers</h3>
            <input
              value={layerQuery}
              onChange={(e) => setLayerQuery(e.target.value)}
              placeholder="Filter layers…"
            />
            <div className="layer-tools">
              <button type="button" onClick={() => onHiddenLayersChange([])}>
                Show all
              </button>
              <button
                type="button"
                onClick={() => onHiddenLayersChange(layers.map((l) => l.name))}
              >
                Hide all
              </button>
            </div>
          </div>
          <div className="layer-list">
            {filteredLayers.map((layer) => {
              const visible = !hiddenSet.has(layer.name)
              return (
                <div
                  key={layer.name}
                  className={`layer-row ${visible ? '' : 'off'} ${
                    selectedLayer === layer.name ? 'selected' : ''
                  } ${layer.likelyAnswer ? 'likely' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleLayer(layer.name)}
                    aria-label={`Toggle ${layer.name}`}
                  />
                  <button
                    type="button"
                    className="layer-name-btn"
                    title={layer.name}
                    onClick={() =>
                      setSelectedLayer((prev) => (prev === layer.name ? null : layer.name))
                    }
                  >
                    <span className="name">{layer.name}</span>
                    {layer.likelyAnswer ? <span className="badge">content</span> : null}
                  </button>
                  <span className="count">{layer.count}</span>
                </div>
              )
            })}
          </div>

          {selectedLayerInfo ? (
            <div className="layer-preview">
              <h4>{selectedLayerInfo.name}</h4>
              <p>
                {selectedLayerInfo.entityCount} entities · {selectedLayerInfo.textCount} texts ·{' '}
                {selectedLayerInfo.kind}
              </p>
              {selectedLayerInfo.sampleTexts.length > 0 ? (
                <ul>
                  {selectedLayerInfo.sampleTexts.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No text on this layer.</p>
              )}
            </div>
          ) : null}
        </aside>

        <div
          ref={viewportRef}
          className={`playground-viewport ${dragging ? 'dragging' : ''} ${
            selectMode ? 'selecting' : ''
          }`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <style>{hideCss}</style>
          {world && camera ? (
            <div
              className={`playground-stage ${
                showLabels && labels.length > 0 ? 'hide-svg-text' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div className="playground-empty">
              Drawing preview could not be opened for this file.
            </div>
          )}

          <div className="label-layer" aria-hidden={!showLabels}>
            {labels.map((label) => (
              <div
                key={label.key}
                className="cad-label"
                style={{ left: label.left, top: label.top }}
                title={`${label.layer}: ${label.text}`}
              >
                {label.text}
              </div>
            ))}
          </div>

          {draftScreen ? (
            <div
              className="region-draft"
              style={{
                left: Math.min(draftScreen.x0, draftScreen.x1),
                top: Math.min(draftScreen.y0, draftScreen.y1),
                width: Math.abs(draftScreen.x1 - draftScreen.x0),
                height: Math.abs(draftScreen.y1 - draftScreen.y0),
              }}
            />
          ) : null}

          {regionOverlay ? (
            <div
              className="region-active"
              style={{
                left: regionOverlay.left,
                top: regionOverlay.top,
                width: regionOverlay.width,
                height: regionOverlay.height,
              }}
            />
          ) : null}

          <div className="playground-hint">
            {selectMode
              ? 'Drag a box to scope the AI export'
              : showLabels
                ? 'Zoom in for sharp labels · station E/N/GL callouts use HTML text'
                : 'Labels off · scroll to zoom · drag to pan'}
          </div>
          <div className="playground-zoom">
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1 / 1.25)}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1.25)}>
              −
            </button>
            <button type="button" aria-label="Fit height" onClick={fitHeight}>
              ⤢
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
