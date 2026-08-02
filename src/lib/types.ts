export type EntityRow = {
  handle: string
  type: string
  layer: string
  colorIndex: string
  color: string
  lineType: string
  visible: string
  text: string
  blockName: string
  attributes: string
  geometry: string
  details: string
  x: number | null
  y: number | null
  x2: number | null
  y2: number | null
}

export type LayerInfo = {
  name: string
  colorIndex: number
  frozen: boolean
  off: boolean
  locked: boolean
  lineType: string
  kind: 'content' | 'structural' | 'mixed'
  likelyAnswer: boolean
  entityCount: number
  textCount: number
  sampleTexts: string[]
}

export type TextItem = {
  handle: string
  layer: string
  type: string
  text: string
  x: number | null
  y: number | null
}

export type BlockItem = {
  handle: string
  layer: string
  name: string
  x: number | null
  y: number | null
  attributes: string
  geometry: string
}

export type TableCluster = {
  layer: string
  title?: string
  /** Column headers including the leading row-label header (e.g. Item). */
  headers: string[]
  rowCount: number
  colCount: number
  /** Full matrix with headers as row 0, then data rows. */
  rows: string[][]
  confidence: number
}

export type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export type RegionBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ExportScope = {
  hiddenLayers: string[]
  region: RegionBox | null
}

export type ParseResult = {
  fileName: string
  fileSizeBytes: number
  format: 'dwg' | 'dxf' | 'kmz' | 'kml'
  entityCount: number
  layerCount: number
  entityTypeCounts: Record<string, number>
  layers: LayerInfo[]
  texts: string[]
  textItems: TextItem[]
  blocks: BlockItem[]
  tables: TableCluster[]
  extents: BoundingBox | null
  unitsHint: string
  geometrySummary: string[]
  rows: EntityRow[]
  svg: string
  aiContext: string
  aiSummary: string
  rawJson: string
}
