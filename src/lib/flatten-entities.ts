import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web'
import type { EntityRow } from './types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function pointXY(point: unknown): { x: number | null; y: number | null } {
  const p = asRecord(point)
  return {
    x: typeof p.x === 'number' ? p.x : null,
    y: typeof p.y === 'number' ? p.y : null,
  }
}

function pointToString(point: unknown): string {
  const { x, y } = pointXY(point)
  if (x == null || y == null) return ''
  const p = asRecord(point)
  const z = typeof p.z === 'number' ? `,${p.z}` : ''
  return `${x},${y}${z}`
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
  } catch {
    return ''
  }
}

/** Strip common MTEXT formatting codes and turn \\P into newlines. */
export function normalizeCadText(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\\P/gi, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\{\\[^;}]*;/g, '')
    .replace(/\}/g, '')
    .replace(/\\[A-Za-z][^;\\]*;?/g, '')
    // AutoCAD special chars: %%C / %C = diameter Ø (pipe legend labels).
    .replace(/%%C/gi, 'Ø')
    .replace(/%C/gi, 'Ø')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

function extractText(entity: DwgEntity | Record<string, unknown>): string {
  const e = asRecord(entity)
  const raw =
    typeof e.text === 'string'
      ? e.text
      : typeof e.textOverride === 'string'
        ? e.textOverride
        : ''
  return normalizeCadText(raw)
}

function transformPoint(
  x: number,
  y: number,
  insert: {
    x: number
    y: number
    rotation: number
    xScale: number
    yScale: number
  },
): { x: number; y: number } {
  const sx = x * insert.xScale
  const sy = y * insert.yScale
  const cos = Math.cos(insert.rotation)
  const sin = Math.sin(insert.rotation)
  return {
    x: insert.x + sx * cos - sy * sin,
    y: insert.y + sx * sin + sy * cos,
  }
}

function extractPosition(entity: DwgEntity | Record<string, unknown>): {
  x: number | null
  y: number | null
  x2: number | null
  y2: number | null
} {
  const e = asRecord(entity)
  const type = String(e.type ?? '')
  switch (type) {
    case 'LINE': {
      const a = pointXY(e.startPoint)
      const b = pointXY(e.endPoint)
      return { x: a.x, y: a.y, x2: b.x, y2: b.y }
    }
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE': {
      const c = pointXY(e.center)
      return { x: c.x, y: c.y, x2: null, y2: null }
    }
    case 'POINT': {
      const p = pointXY(e.position)
      return { x: p.x, y: p.y, x2: null, y2: null }
    }
    case 'INSERT':
    case 'MTEXT': {
      const p = pointXY(e.insertionPoint)
      return { x: p.x, y: p.y, x2: null, y2: null }
    }
    case 'TEXT':
    case 'ATTDEF':
    case 'ATTRIB': {
      const p = pointXY(e.startPoint)
      return { x: p.x, y: p.y, x2: null, y2: null }
    }
    case 'LWPOLYLINE': {
      const vertices = Array.isArray(e.vertices) ? e.vertices : []
      const first = pointXY(vertices[0])
      return { x: first.x, y: first.y, x2: null, y2: null }
    }
    case 'DIMENSION': {
      const p = pointXY(e.textMidPoint ?? e.definitionPoint)
      return { x: p.x, y: p.y, x2: null, y2: null }
    }
    default: {
      const p = pointXY(
        e.insertionPoint ?? e.startPoint ?? e.center ?? e.position,
      )
      return { x: p.x, y: p.y, x2: null, y2: null }
    }
  }
}

function extractGeometry(entity: DwgEntity | Record<string, unknown>): string {
  const e = asRecord(entity)
  const type = String(e.type ?? '')
  switch (type) {
    case 'LINE':
      return `start=${pointToString(e.startPoint)}; end=${pointToString(e.endPoint)}`
    case 'CIRCLE':
      return `center=${pointToString(e.center)}; radius=${e.radius}`
    case 'ARC':
      return `center=${pointToString(e.center)}; radius=${e.radius}; start=${e.startAngle}; end=${e.endAngle}`
    case 'POINT':
      return `position=${pointToString(e.position)}`
    case 'ELLIPSE':
      return `center=${pointToString(e.center)}; majorAxis=${pointToString(e.majorAxisEndPoint)}; ratio=${e.axisRatio}`
    case 'LWPOLYLINE': {
      const vertices = Array.isArray(e.vertices) ? e.vertices : []
      return `closed=${Boolean(Number(e.flag) & 1)}; vertices=${safeJson(vertices)}`
    }
    case 'POLYLINE':
    case 'POLYLINE_2D':
    case 'POLYLINE_3D':
      return `vertices=${safeJson(e.vertices)}`
    case 'SPLINE':
      return `controlPoints=${safeJson(e.controlPoints)}; fitPoints=${safeJson(e.fitPoints)}`
    case 'INSERT':
      return `insert=${pointToString(e.insertionPoint)}; scale=${e.xScale},${e.yScale},${e.zScale}; rot=${e.rotation}`
    case 'TEXT':
    case 'ATTDEF':
    case 'ATTRIB':
      return `start=${pointToString(e.startPoint)}; height=${e.textHeight}; rot=${e.rotation}`
    case 'MTEXT':
      return `insert=${pointToString(e.insertionPoint)}; height=${e.textHeight}; width=${e.rectWidth}`
    case 'DIMENSION':
      return `def=${pointToString(e.definitionPoint)}; textMid=${pointToString(e.textMidPoint)}; measurement=${e.measurement ?? ''}`
    case 'HATCH':
      return `pattern=${e.patternName ?? ''}; solid=${e.isSolid ?? ''}`
    case 'SOLID':
    case 'TRACE':
    case '3DFACE':
      return `corners=${safeJson([e.firstCorner, e.secondCorner, e.thirdCorner, e.fourthCorner])}`
    case 'RAY':
    case 'XLINE':
      return `base=${pointToString(e.firstPoint ?? e.startPoint)}; dir=${pointToString(e.unitDirection ?? e.direction)}`
    default:
      return ''
  }
}

function extractAttributes(entity: DwgEntity | Record<string, unknown>): string {
  const e = asRecord(entity)
  if (!Array.isArray(e.attribs) || e.attribs.length === 0) return ''
  return e.attribs
    .map((attr) => {
      const a = asRecord(attr)
      const tag = typeof a.tag === 'string' ? a.tag : 'ATTR'
      const text = typeof a.text === 'string' ? a.text : ''
      return `${tag}=${text}`
    })
    .join('; ')
}

function extractDetails(entity: DwgEntity | Record<string, unknown>): string {
  const reserved = new Set([
    'type',
    'handle',
    'layer',
    'colorIndex',
    'color',
    'colorName',
    'lineType',
    'isVisible',
    'text',
    'name',
    'attribs',
    'ownerBlockRecordSoftId',
    'transparencyType',
    'xdata',
  ])
  const e = asRecord(entity)
  const details: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(e)) {
    if (reserved.has(key)) continue
    if (value === undefined || value === null) continue
    details[key] = value
  }
  return safeJson(details)
}

export function entityToRow(entity: DwgEntity | Record<string, unknown>): EntityRow {
  const e = asRecord(entity)
  const pos = extractPosition(entity)
  const type = String(e.type ?? 'UNKNOWN')
  return {
    handle: String(e.handle ?? ''),
    type,
    layer: String(e.layer ?? ''),
    colorIndex: e.colorIndex == null ? '' : String(e.colorIndex),
    color: e.color == null ? '' : String(e.color),
    lineType: String(e.lineType ?? 'BYLAYER'),
    visible: e.isVisible === false ? 'false' : 'true',
    text: extractText(entity),
    blockName: type === 'INSERT' && typeof e.name === 'string' ? e.name : '',
    attributes: extractAttributes(entity),
    geometry: extractGeometry(entity),
    details: extractDetails(entity),
    x: pos.x,
    y: pos.y,
    x2: pos.x2,
    y2: pos.y2,
  }
}

function blockEntries(db: DwgDatabase): Array<{
  name: string
  entities: DwgEntity[]
}> {
  const entries = db.tables?.BLOCK_RECORD?.entries ?? []
  return entries.map((block) => {
    const b = asRecord(block)
    return {
      name: typeof b.name === 'string' ? b.name : '',
      entities: Array.isArray(b.entities) ? (b.entities as DwgEntity[]) : [],
    }
  })
}

function isSpaceBlock(name: string): boolean {
  return (
    name === '*Model_Space' ||
    name === '*Paper_Space' ||
    name.startsWith('*Paper_Space')
  )
}

/**
 * Station callouts (E:/N:/GL:) often live inside anonymous *U blocks that are
 * INSERTed once. Top-level db.entities misses those texts; expand them here.
 */
export function flattenEntities(db: DwgDatabase): EntityRow[] {
  const rows = db.entities.map((entity) => entityToRow(entity))
  const blocks = blockEntries(db)
  const byName = new Map(blocks.map((b) => [b.name, b.entities]))

  for (const entity of db.entities) {
    const e = asRecord(entity)
    if (String(e.type) !== 'INSERT') continue
    const name = typeof e.name === 'string' ? e.name : ''
    if (!name || isSpaceBlock(name)) continue
    const nested = byName.get(name)
    if (!nested?.length) continue

    const ip = pointXY(e.insertionPoint)
    const insert = {
      x: ip.x ?? 0,
      y: ip.y ?? 0,
      rotation: typeof e.rotation === 'number' ? e.rotation : 0,
      xScale: typeof e.xScale === 'number' ? e.xScale : 1,
      yScale: typeof e.yScale === 'number' ? e.yScale : 1,
    }

    for (const child of nested) {
      const c = asRecord(child)
      const type = String(c.type ?? '')
      if (type !== 'TEXT' && type !== 'MTEXT' && type !== 'ATTRIB' && type !== 'ATTDEF') {
        continue
      }
      const row = entityToRow(child)
      if (!row.text) continue
      if (row.x != null && row.y != null) {
        const p = transformPoint(row.x, row.y, insert)
        row.x = p.x
        row.y = p.y
      }
      row.blockName = name
      rows.push(row)
    }
  }

  return rows
}

export function collectTexts(rows: EntityRow[]): string[] {
  return [...new Set(rows.map((row) => row.text.trim()).filter(Boolean))]
}

export function countTypes(rows: EntityRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.type] = (counts[row.type] ?? 0) + 1
  }
  return counts
}
