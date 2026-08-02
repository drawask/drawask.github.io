import type {
  BlockItem,
  BoundingBox,
  EntityRow,
  LayerInfo,
  TextItem,
} from './types'

export {
  cleanCadText,
  clusterTextTables,
  isAxisOrRulerTable,
  tableToCsv,
  tableToMarkdown,
} from './table-detect.ts'

const CONTENT_RE = /(TEXT|LABEL|ANNO|NOTE|TITLE|TABL|ATTR|DATA|PROP|MARK|LEGEND|SCHED)/i
const STRUCTURAL_RE =
  /(DIM|HATCH|VIEWPORT|VP|GRID|AXIS|TICK|CENTER|BORDER|DEFP|XREF|WIPE|PATT|PROF-GRID|HIDDEN)/i

export function computeExtents(rows: EntityRow[]): BoundingBox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false

  for (const row of rows) {
    for (const [x, y] of [
      [row.x, row.y],
      [row.x2, row.y2],
    ] as const) {
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
      found = true
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (!found) return null
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function collectTextItems(rows: EntityRow[]): TextItem[] {
  const items: TextItem[] = []
  for (const row of rows) {
    const text = row.text.trim()
    if (!text) continue
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    // Stacked MTEXT lines (E: / N:) share one insertion point; nudge later lines
    // down in CAD Y so HTML labels don't sit on top of each other.
    const lineStep = Math.max(2.2, lines.length > 1 ? 2.5 : 0)
    lines.forEach((line, i) => {
      items.push({
        handle: lines.length > 1 ? `${row.handle}:${i}` : row.handle,
        layer: row.layer,
        type: row.type,
        text: line,
        x: row.x,
        y: row.y == null ? null : row.y - i * lineStep,
      })
    })
  }
  return items
}

export function collectBlocks(rows: EntityRow[]): BlockItem[] {
  return rows
    .filter((row) => row.type === 'INSERT')
    .map((row) => ({
      handle: row.handle,
      layer: row.layer,
      name: row.blockName || '(unnamed)',
      x: row.x,
      y: row.y,
      attributes: row.attributes,
      geometry: row.geometry,
    }))
}

function classifyLayerName(name: string): 'content' | 'structural' | 'mixed' {
  const content = CONTENT_RE.test(name)
  const structural = STRUCTURAL_RE.test(name)
  if (content && !structural) return 'content'
  if (structural && !content) return 'structural'
  if (content && structural) return 'mixed'
  return 'mixed'
}

export function enrichLayers(
  baseLayers: Array<{
    name: string
    colorIndex: number
    frozen: boolean
    off: boolean
    locked: boolean
    lineType: string
  }>,
  rows: EntityRow[],
): LayerInfo[] {
  const byLayer = new Map<string, EntityRow[]>()
  for (const row of rows) {
    const list = byLayer.get(row.layer) ?? []
    list.push(row)
    byLayer.set(row.layer, list)
  }

  const names = new Set<string>([
    ...baseLayers.map((l) => l.name),
    ...byLayer.keys(),
  ])

  return [...names]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const meta = baseLayers.find((l) => l.name === name)
      const entities = byLayer.get(name) ?? []
      const texts = entities
        .map((e) => e.text.trim())
        .filter(Boolean)
      const uniqueTexts = [...new Set(texts)]
      const textRatio = entities.length ? texts.length / entities.length : 0
      let kind = classifyLayerName(name)
      if (kind === 'mixed') {
        if (textRatio >= 0.35) kind = 'content'
        else if (textRatio <= 0.05 && entities.length >= 8) kind = 'structural'
      }
      return {
        name,
        colorIndex: meta?.colorIndex ?? 7,
        frozen: meta?.frozen ?? false,
        off: meta?.off ?? false,
        locked: meta?.locked ?? false,
        lineType: meta?.lineType ?? 'Continuous',
        kind,
        likelyAnswer: kind === 'content' || CONTENT_RE.test(name),
        entityCount: entities.length,
        textCount: uniqueTexts.length,
        sampleTexts: uniqueTexts.slice(0, 8),
      }
    })
}

export function summarizeGeometry(rows: EntityRow[]): string[] {
  const typeCounts: Record<string, number> = {}
  for (const row of rows) {
    typeCounts[row.type] = (typeCounts[row.type] ?? 0) + 1
  }

  const lines: string[] = []
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    if (type === 'LINE' && count >= 50) {
      lines.push(
        `${count} LINE entities (often grid, axes, borders, or drafting aids — summarized, not listed individually)`,
      )
    } else if ((type === 'LWPOLYLINE' || type === 'POLYLINE' || type === 'POLYLINE2D') && count >= 40) {
      lines.push(`${count} ${type} entities (polyline geometry summarized)`)
    } else if (type === 'HATCH' && count >= 10) {
      lines.push(`${count} HATCH entities (fill patterns summarized)`)
    } else if (count >= 100 && type !== 'TEXT' && type !== 'MTEXT' && type !== 'INSERT') {
      lines.push(`${count} ${type} entities (high-volume type summarized)`)
    } else {
      lines.push(`${count} ${type}`)
    }
  }
  return lines
}

export function localOriginHint(extents: BoundingBox | null): string {
  if (!extents) return 'No extents available.'
  const looksSurvey =
    Math.abs(extents.minX) > 10_000 || Math.abs(extents.minY) > 10_000
  if (!looksSurvey) {
    return `Extents appear local/drawing-space: origin-ish near (${extents.minX.toFixed(3)}, ${extents.minY.toFixed(3)}).`
  }
  return [
    `Extents look like real-world/survey coordinates.`,
    `World bbox: (${extents.minX.toFixed(3)}, ${extents.minY.toFixed(3)}) → (${extents.maxX.toFixed(3)}, ${extents.maxY.toFixed(3)}).`,
    `For relative/local discussion, treat southwest corner (${extents.minX.toFixed(3)}, ${extents.minY.toFixed(3)}) as local (0, 0).`,
    `Drawing size ≈ ${extents.width.toFixed(3)} × ${extents.height.toFixed(3)} drawing units.`,
  ].join(' ')
}
