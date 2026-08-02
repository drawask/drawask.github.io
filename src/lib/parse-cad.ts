import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import { buildAiReport } from './ai-report'
import { collectTexts, countTypes, flattenEntities } from './flatten-entities'
import { parseDxfFile } from './parse-dxf'
import { parseKmzOrKmlFile } from './parse-kml'
import { prepareSvgForPreview } from './prepare-svg'
import {
  clusterTextTables,
  collectBlocks,
  collectTextItems,
  computeExtents,
  enrichLayers,
  localOriginHint,
  summarizeGeometry,
} from './smart-extract'
import type { ParseResult } from './types'

function safeJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === 'bigint' ? v.toString() : v),
    space,
  )
}

let libredwgPromise: Promise<Awaited<ReturnType<typeof LibreDwg.create>>> | null = null

async function getLibreDwg() {
  if (!libredwgPromise) {
    libredwgPromise = LibreDwg.create('/wasm')
  }
  return libredwgPromise
}

function unitsHintFromHeader(header: unknown): string {
  const h = header && typeof header === 'object' ? (header as Record<string, unknown>) : {}
  const insunits = h.insunits ?? h.INSUNITS ?? h.$INSUNITS
  if (insunits == null) return 'unknown (INSUNITS not found)'
  const map: Record<string, string> = {
    '0': 'unitless',
    '1': 'inches',
    '2': 'feet',
    '4': 'mm',
    '5': 'cm',
    '6': 'm',
  }
  return map[String(insunits)] ?? `INSUNITS=${String(insunits)}`
}

function finalize(input: {
  file: File
  format: ParseResult['format']
  rows: ParseResult['rows']
  baseLayers: Array<{
    name: string
    colorIndex: number
    frozen: boolean
    off: boolean
    locked: boolean
    lineType: string
  }>
  svg: string
  header: unknown
  rawJsonPayload: unknown
  unitsHint?: string
}): ParseResult {
  const entityTypeCounts = countTypes(input.rows)
  const textItems = collectTextItems(input.rows)
  const blocks = collectBlocks(input.rows)
  const tables = clusterTextTables(textItems)
  const extents = computeExtents(input.rows)
  const layers = enrichLayers(input.baseLayers, input.rows)
  const unitsHint = input.unitsHint ?? unitsHintFromHeader(input.header)
  const geometrySummary = summarizeGeometry(input.rows)

  const partial = {
    fileName: input.file.name,
    fileSizeBytes: input.file.size,
    format: input.format,
    entityCount: input.rows.length,
    layerCount: layers.length,
    entityTypeCounts,
    layers,
    texts: collectTexts(input.rows),
    textItems,
    blocks,
    tables,
    extents,
    unitsHint,
    geometrySummary,
    rows: input.rows,
    svg: input.svg,
    aiContext: '',
    aiSummary: '',
    rawJson: safeJson(input.rawJsonPayload, 2),
  } satisfies ParseResult

  const emptyScope = { hiddenLayers: [], region: null }
  partial.aiSummary = buildAiReport(partial, { scope: emptyScope, mode: 'summary' })
  partial.aiContext = buildAiReport(partial, { scope: emptyScope, mode: 'detailed' })
  // Attach coordinate note into summary once more for clarity
  void localOriginHint(extents)

  return partial
}

async function parseDwg(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const libredwg = await getLibreDwg()
  const dwgPtr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG)
  if (dwgPtr == null) {
    throw new Error('Could not read this DWG file. It may be corrupt or unsupported.')
  }

  try {
    const { database: db, stats } = libredwg.convertEx(dwgPtr)
    const rows = flattenEntities(db)
    const baseLayers = (db.tables?.LAYER?.entries ?? []).map((layer) => ({
      name: layer.name,
      colorIndex: layer.colorIndex,
      frozen: layer.frozen,
      off: layer.off,
      locked: layer.locked,
      lineType: layer.lineType,
    }))

    const handleToLayer = new Map<string, string>()
    const indexLayer = (entity: { handle?: unknown; layer?: unknown }) => {
      if (entity.handle && entity.layer) {
        handleToLayer.set(String(entity.handle), String(entity.layer))
      }
    }
    for (const entity of db.entities) indexLayer(entity)
    for (const block of db.tables?.BLOCK_RECORD?.entries ?? []) {
      for (const entity of block.entities ?? []) indexLayer(entity)
    }

    let svg = ''
    try {
      svg = prepareSvgForPreview(libredwg.dwg_to_svg(db), handleToLayer)
    } catch {
      svg = ''
    }

    if (stats.unknownEntityCount > 0) {
      console.warn(`Skipped ${stats.unknownEntityCount} unknown entities`)
    }

    return finalize({
      file,
      format: 'dwg',
      rows,
      baseLayers,
      svg,
      header: db.header,
      rawJsonPayload: {
        header: db.header,
        tables: {
          LAYER: db.tables.LAYER,
          BLOCK_RECORD: db.tables.BLOCK_RECORD,
          STYLE: db.tables.STYLE,
          LTYPE: db.tables.LTYPE,
          DIMSTYLE: db.tables.DIMSTYLE,
          VPORT: db.tables.VPORT,
        },
        entities: db.entities,
        objects: db.objects,
        classes: db.classes,
      },
    })
  } finally {
    libredwg.dwg_free(dwgPtr)
  }
}

export async function parseCadFile(file: File): Promise<ParseResult> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.dwg')) return parseDwg(file)
  if (lower.endsWith('.dxf')) {
    const parsed = await parseDxfFile(file)
    return finalize({
      file,
      format: 'dxf',
      rows: parsed.rows,
      baseLayers: parsed.layers,
      svg: '', // DXF visual playground can be added later
      header: parsed.header,
      rawJsonPayload: parsed.raw,
    })
  }
  if (lower.endsWith('.kmz') || lower.endsWith('.kml')) {
    const parsed = await parseKmzOrKmlFile(file)
    return finalize({
      file,
      format: lower.endsWith('.kmz') ? 'kmz' : 'kml',
      rows: parsed.rows,
      baseLayers: parsed.layers,
      // KMZ/KML SVG is already local + Y-flipped for the playground.
      svg: parsed.svg,
      header: parsed.header,
      rawJsonPayload: parsed.raw,
      unitsHint: 'WGS84 degrees (longitude/latitude)',
    })
  }
  throw new Error('Please upload a .dwg, .dxf, .kmz, or .kml file.')
}
