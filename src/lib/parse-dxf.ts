import DxfParser from 'dxf-parser'
import { entityToRow } from './flatten-entities'
import type { EntityRow } from './types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeDxfEntity(raw: Record<string, unknown>): Record<string, unknown> {
  const type = String(raw.type ?? 'UNKNOWN').toUpperCase()
  const entity: Record<string, unknown> = {
    ...raw,
    type,
    handle: raw.handle == null ? '' : String(raw.handle),
    layer: String(raw.layer ?? '0'),
  }

  if (type === 'LINE' && Array.isArray(raw.vertices) && raw.vertices.length >= 2) {
    entity.startPoint = raw.vertices[0]
    entity.endPoint = raw.vertices[1]
  }

  if (type === 'INSERT') {
    entity.name = raw.name ?? raw.blockName ?? ''
    entity.insertionPoint = raw.position ?? raw.insertionPoint
  }

  if (type === 'TEXT' || type === 'MTEXT') {
    entity.startPoint = raw.startPoint ?? raw.position
    entity.insertionPoint = raw.position ?? raw.startPoint
  }

  return entity
}

export async function parseDxfFile(file: File): Promise<{
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
}> {
  const text = await file.text()
  const parser = new DxfParser()
  const dxf = parser.parseSync(text)
  if (!dxf) {
    throw new Error('Could not parse this DXF file.')
  }

  const entities = Array.isArray(dxf.entities) ? dxf.entities : []
  const rows = entities.map((entity) => entityToRow(normalizeDxfEntity(asRecord(entity))))

  const layerTable = asRecord(asRecord(dxf.tables).layer)
  const layerEntries = asRecord(layerTable.layers)
  const layers = Object.keys(layerEntries).map((name) => {
    const layer = asRecord(layerEntries[name])
    return {
      name,
      colorIndex: typeof layer.color === 'number' ? layer.color : 7,
      frozen: Boolean(layer.frozen),
      off: false,
      locked: Boolean(layer.locked),
      lineType: String(layer.lineTypeName ?? 'Continuous'),
    }
  })

  if (layers.length === 0) {
    const names = [...new Set(rows.map((r) => r.layer).filter(Boolean))]
    for (const name of names) {
      layers.push({
        name,
        colorIndex: 7,
        frozen: false,
        off: false,
        locked: false,
        lineType: 'Continuous',
      })
    }
  }

  return {
    rows,
    layers,
    header: asRecord(dxf.header),
    raw: dxf,
  }
}
