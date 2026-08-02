import { DOMParser } from '@xmldom/xmldom'
import { unzipSync, strFromU8 } from 'fflate'
import type { EntityRow } from './types'

type ParsedKml = {
  rows: EntityRow[]
  layers: Array<{
    name: string
    colorIndex: number
    frozen: boolean
    off: boolean
    locked: boolean
    lineType: string
  }>
  header: Record<string, unknown>
  raw: unknown
  svg: string
}

function textOf(el: Element | null): string {
  if (!el) return ''
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function parseCoords(text: string): Array<{ x: number; y: number; z: number }> {
  return text
    .trim()
    .split(/\s+/)
    .map((triple) => {
      const [lon, lat, alt] = triple.split(',').map(Number)
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
      return { x: lon, y: lat, z: Number.isFinite(alt) ? alt : 0 }
    })
    .filter((p): p is { x: number; y: number; z: number } => p != null)
}

function localName(node: Element): string {
  return (node.localName || node.nodeName || '').replace(/^.*:/, '').toLowerCase()
}

function childrenBy(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && localName(n as Element) === name,
  )
}

function firstChild(el: Element, name: string): Element | null {
  return childrenBy(el, name)[0] ?? null
}

function walkFolders(
  el: Element,
  path: string[],
  out: Array<{ folder: string; placemark: Element }>,
) {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== 1) continue
    const node = child as Element
    const name = localName(node)
    if (name === 'folder' || name === 'document') {
      const folderName = textOf(firstChild(node, 'name')) || name
      walkFolders(node, [...path, folderName], out)
    } else if (name === 'placemark') {
      out.push({ folder: path.filter(Boolean).join(' / ') || 'KML', placemark: node })
    }
  }
}

function geometryFromPlacemark(pm: Element): {
  type: string
  points: Array<{ x: number; y: number; z: number }>
} {
  const point = firstChild(pm, 'point')
  if (point) {
    const coords = parseCoords(textOf(firstChild(point, 'coordinates')))
    return { type: 'POINT', points: coords }
  }
  const line = firstChild(pm, 'linestring')
  if (line) {
    return {
      type: 'LINESTRING',
      points: parseCoords(textOf(firstChild(line, 'coordinates'))),
    }
  }
  const poly = firstChild(pm, 'polygon')
  if (poly) {
    const ring =
      firstChild(firstChild(poly, 'outerboundaryis') ?? poly, 'linearring') ??
      firstChild(poly, 'linearring')
    return {
      type: 'POLYGON',
      points: parseCoords(textOf(ring ? firstChild(ring, 'coordinates') : null)),
    }
  }
  // MultiGeometry / nested: first Point, LineString, or Polygon descendant.
  const multi = firstChild(pm, 'multigeometry') ?? pm
  for (const node of Array.from(multi.getElementsByTagName('*'))) {
    const el = node as Element
    const n = localName(el)
    if (n === 'point') {
      const coords = parseCoords(textOf(firstChild(el, 'coordinates')))
      if (coords.length) return { type: 'POINT', points: coords }
    }
    if (n === 'linestring') {
      const coords = parseCoords(textOf(firstChild(el, 'coordinates')))
      if (coords.length) return { type: 'LINESTRING', points: coords }
    }
    if (n === 'polygon') {
      const ring =
        firstChild(firstChild(el, 'outerboundaryis') ?? el, 'linearring') ??
        firstChild(el, 'linearring')
      const coords = parseCoords(textOf(ring ? firstChild(ring, 'coordinates') : null))
      if (coords.length) return { type: 'POLYGON', points: coords }
    }
  }
  return { type: 'UNKNOWN', points: [] }
}

function buildSvg(
  rows: EntityRow[],
): string {
  const pts = rows.filter((r) => r.x != null && r.y != null) as Array<
    EntityRow & { x: number; y: number }
  >
  if (pts.length === 0) return ''

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 0.02
  const w = Math.max(maxX - minX, 1e-6)
  const h = Math.max(maxY - minY, 1e-6)
  const vbX = minX - w * pad
  const vbY = -(maxY + h * pad)
  const vbW = w * (1 + pad * 2)
  const vbH = h * (1 + pad * 2)

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" data-origin-x="${vbX}" data-origin-y="${vbY}" data-world-width="${vbW}" data-world-height="${vbH}" width="100%" height="100%" style="background:#0b1220;display:block">`,
    `<g id="cad-local" transform="scale(1,-1)">`,
  ]

  const byLayer = new Map<string, EntityRow[]>()
  for (const row of rows) {
    const list = byLayer.get(row.layer) ?? []
    list.push(row)
    byLayer.set(row.layer, list)
  }

  let i = 0
  for (const [layer, layerRows] of byLayer) {
    const safe = layer.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    parts.push(`<g data-layer="${safe}" id="kml-${i++}" stroke="rgb(226,232,240)" fill="none">`)
    for (const row of layerRows) {
      if (row.type === 'POINT' && row.x != null && row.y != null) {
        // Labels stay in entity rows / HTML overlays; SVG text would flip with Y.
        parts.push(
          `<circle cx="${row.x}" cy="${row.y}" r="${Math.max(w, h) * 0.008}" fill="rgb(45,212,191)" stroke="none" />`,
        )
      } else if (
        (row.type === 'LINESTRING' || row.type === 'POLYGON') &&
        row.geometry.startsWith('coords=')
      ) {
        const raw = row.geometry.slice('coords='.length)
        try {
          const coords = JSON.parse(raw) as Array<{ x: number; y: number }>
          if (coords.length >= 2) {
            const d = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
            parts.push(
              `<path d="${d}${row.type === 'POLYGON' ? ' Z' : ''}" stroke="rgb(94,234,212)" stroke-width="${Math.max(w, h) * 0.003}" fill="${row.type === 'POLYGON' ? 'rgba(45,212,191,0.15)' : 'none'}" />`,
            )
          }
        } catch {
          // ignore bad geometry payload
        }
      }
    }
    parts.push('</g>')
  }

  parts.push('</g></svg>')
  return parts.join('')
}

/** Google Earth often emits xsi:schemaLocation without xmlns:xsi. */
function normalizeKmlXml(kmlText: string): string {
  let text = kmlText
  if (/\bxsi:/.test(text) && !/\bxmlns:xsi=/.test(text)) {
    text = text.replace(
      /<kml\b/i,
      '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    )
  }
  return text
}

export function parseKmlText(kmlText: string): ParsedKml {
  const doc = new DOMParser().parseFromString(normalizeKmlXml(kmlText), 'text/xml')
  const rootNode =
    Array.from(doc.childNodes).find((n) => n.nodeType === 1 && localName(n as unknown as Element) === 'kml') ??
    doc.documentElement

  if (!rootNode || rootNode.nodeType !== 1) {
    throw new Error('Could not parse this KML file.')
  }

  const root = rootNode as unknown as Element
  const placemarks: Array<{ folder: string; placemark: Element }> = []
  walkFolders(root, [], placemarks)

  const rows: EntityRow[] = []
  let handle = 1
  for (const { folder, placemark } of placemarks) {
    const name = textOf(firstChild(placemark, 'name'))
    const description = textOf(firstChild(placemark, 'description'))
    const geom = geometryFromPlacemark(placemark)
    if (geom.points.length === 0 && !name && !description) continue

    const first = geom.points[0]
    const last = geom.points[geom.points.length - 1]
    const text = [name, description].filter(Boolean).join(' · ')
    rows.push({
      handle: `kml-${handle++}`,
      type: geom.type,
      layer: folder,
      colorIndex: '',
      color: '',
      lineType: 'Continuous',
      visible: 'true',
      text,
      blockName: '',
      attributes: description && name ? `name=${name}` : '',
      geometry:
        geom.points.length > 0
          ? `coords=${JSON.stringify(geom.points.map((p) => ({ x: p.x, y: p.y, z: p.z })))}`
          : '',
      details: JSON.stringify({ name, description, pointCount: geom.points.length }),
      x: first?.x ?? null,
      y: first?.y ?? null,
      x2: last && geom.points.length > 1 ? last.x : null,
      y2: last && geom.points.length > 1 ? last.y : null,
    })
  }

  const layerNames = [...new Set(rows.map((r) => r.layer))]
  const layers = layerNames.map((name) => ({
    name,
    colorIndex: 3,
    frozen: false,
    off: false,
    locked: false,
    lineType: 'Continuous',
  }))

  return {
    rows,
    layers,
    header: {
      format: 'KML',
      placemarkCount: rows.length,
      note: 'Coordinates are longitude (x) / latitude (y) in WGS84 degrees.',
    },
    raw: { placemarkCount: rows.length, layers: layerNames },
    svg: buildSvg(rows),
  }
}

export async function parseKmzOrKmlFile(file: File): Promise<ParsedKml> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.kml')) {
    return parseKmlText(await file.text())
  }
  if (!lower.endsWith('.kmz')) {
    throw new Error('Expected a .kmz or .kml file.')
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(buffer)
  } catch {
    throw new Error('Could not open this KMZ (invalid zip archive).')
  }

  const names = Object.keys(files)
  const kmlName =
    names.find((n) => /(^|\/)doc\.kml$/i.test(n)) ??
    names.find((n) => n.toLowerCase().endsWith('.kml'))
  if (!kmlName) {
    throw new Error('This KMZ does not contain a .kml file.')
  }

  const kmlText = strFromU8(files[kmlName])
  const parsed = parseKmlText(kmlText)
  parsed.header = {
    ...parsed.header,
    format: 'KMZ',
    kmlEntry: kmlName,
    zipEntries: names.length,
  }
  return parsed
}
