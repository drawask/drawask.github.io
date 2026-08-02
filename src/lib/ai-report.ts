import { describeScope, filterRowsByScope } from './scope'
import {
  clusterTextTables,
  collectBlocks,
  collectTextItems,
  computeExtents,
  enrichLayers,
  localOriginHint,
  summarizeGeometry,
  tableToMarkdown,
} from './smart-extract'
import { cleanCadText } from './table-detect'
import type { ExportScope, ParseResult } from './types'

export type ReportMode = 'summary' | 'detailed'

export function buildAiReport(
  result: ParseResult,
  options: {
    scope: ExportScope
    mode?: ReportMode
    userQuestion?: string
  },
): string {
  const mode = options.mode ?? 'summary'
  const scopedRows = filterRowsByScope(result.rows, options.scope)
  const textItems = collectTextItems(scopedRows)
  const blocks = collectBlocks(scopedRows)
  const tables = clusterTextTables(textItems)
  const extents = computeExtents(scopedRows)
  const layers = enrichLayers(
    result.layers.map((l) => ({
      name: l.name,
      colorIndex: l.colorIndex,
      frozen: l.frozen,
      off: l.off,
      locked: l.locked,
      lineType: l.lineType,
    })),
    scopedRows,
  ).filter((l) => !options.scope.hiddenLayers.includes(l.name))

  const contentLayers = layers.filter((l) => l.kind === 'content' || l.likelyAnswer)
  const structuralLayers = layers.filter((l) => l.kind === 'structural')
  const geometrySummary = summarizeGeometry(scopedRows)

  const uniqueTexts = [
    ...new Set(
      textItems
        .map((t) => cleanCadText(t.text))
        .filter((t) => t && !/^\\?\{?\\C\d+;?\}?$/i.test(t)),
    ),
  ]
  const textLimit = mode === 'summary' ? 120 : 800
  const blockLimit = mode === 'summary' ? 40 : 300
  const tableLimit = mode === 'summary' ? 4 : 20

  const question = options.userQuestion?.trim()

  const parts: string[] = []

  parts.push(`# CAD extract for AI`)
  parts.push('')
  parts.push(
    `This block is a structured extract from a CAD drawing. Use it for quantity takeoff, cost estimation, design review, clash notes, or any other analysis the user asks for.`,
  )
  parts.push('')

  if (question) {
    parts.push(`## User question`)
    parts.push(question)
    parts.push('')
    parts.push(
      `Answer using the extract below. If something needed is missing from this scoped extract, say what layer/region should be exported next.`,
    )
    parts.push('')
  }

  parts.push(`## File metadata`)
  parts.push(`- filename: ${result.fileName}`)
  parts.push(`- format: ${result.format.toUpperCase()}`)
  parts.push(`- size_bytes: ${result.fileSizeBytes}`)
  parts.push(`- units_hint: ${result.unitsHint}`)
  parts.push(`- entities_in_scope: ${scopedRows.length} / ${result.entityCount} total`)
  parts.push(`- layers_in_scope: ${layers.length}`)
  parts.push(`- scope: ${describeScope(options.scope, result.layerCount)}`)
  parts.push('')

  parts.push(`## Coordinate / scale notes`)
  parts.push(localOriginHint(extents))
  if (extents) {
    parts.push(
      `- bbox: min(${extents.minX.toFixed(3)}, ${extents.minY.toFixed(3)}) max(${extents.maxX.toFixed(3)}, ${extents.maxY.toFixed(3)}) size(${extents.width.toFixed(3)} × ${extents.height.toFixed(3)})`,
    )
  }
  parts.push('')

  parts.push(`## Entity counts (scoped, summarized)`)
  for (const line of geometrySummary) parts.push(`- ${line}`)
  parts.push('')

  const hasPipeLayers = layers.some((l) => /PO-Ø\d+/i.test(l.name))
  if (hasPipeLayers || result.format === 'kmz' || result.format === 'kml') {
    parts.push(`## Pipe diameter color legend`)
    parts.push(`- PO-Ø250 HDPE → green`)
    parts.push(`- PO-Ø400 HDPE → yellow`)
    parts.push(`- PO-Ø500 HDPE → blue`)
    parts.push(`- PO-Ø600 HDPE → red`)
    parts.push(`- Other diameters use distinct colors; layer names are \`PO-Ø{mm} HDPE\`.`)
    parts.push('')
  }

  parts.push(`## Layers likely to contain answers`)
  if (contentLayers.length === 0) parts.push(`- (none auto-flagged; inspect full layer list)`)
  for (const layer of contentLayers.slice(0, 40)) {
    parts.push(
      `- \`${layer.name}\` [${layer.kind}] entities=${layer.entityCount}, unique_text=${layer.textCount}${
        layer.sampleTexts.length ? `, samples: ${layer.sampleTexts.slice(0, 4).join(' | ')}` : ''
      }`,
    )
  }
  parts.push('')

  parts.push(`## Structural / drafting-aid layers`)
  if (structuralLayers.length === 0) parts.push(`- (none auto-flagged)`)
  for (const layer of structuralLayers.slice(0, 30)) {
    parts.push(`- \`${layer.name}\` entities=${layer.entityCount}`)
  }
  parts.push('')

  parts.push(`## Detected labeled tables`)
  if (tables.length === 0) {
    parts.push(`- No clear labeled tables detected in this scope.`)
  } else {
    for (const table of tables.slice(0, tableLimit)) {
      parts.push(tableToMarkdown(table, mode === 'summary' ? 24 : 80))
      parts.push('')
    }
  }

  parts.push(`## Important text (unique, scoped)`)
  if (uniqueTexts.length === 0) parts.push(`- (no text in scope)`)
  for (const text of uniqueTexts.slice(0, textLimit)) {
    parts.push(`- ${text}`)
  }
  if (uniqueTexts.length > textLimit) {
    parts.push(`- … ${uniqueTexts.length - textLimit} more text values omitted (${mode} mode)`)
  }
  parts.push('')

  parts.push(`## Block inserts`)
  if (blocks.length === 0) parts.push(`- (none in scope)`)
  for (const block of blocks.slice(0, blockLimit)) {
    const pos =
      block.x != null && block.y != null
        ? ` @ (${block.x.toFixed(3)}, ${block.y.toFixed(3)})`
        : ''
    const attrs = block.attributes ? ` attrs: ${block.attributes}` : ''
    parts.push(`- \`${block.name}\` on \`${block.layer}\`${pos}${attrs}`)
  }
  if (blocks.length > blockLimit) {
    parts.push(`- … ${blocks.length - blockLimit} more inserts omitted (${mode} mode)`)
  }
  parts.push('')

  if (mode === 'detailed') {
    parts.push(`## Text with positions`)
    for (const item of textItems.slice(0, 1000)) {
      const pos =
        item.x != null && item.y != null
          ? `(${item.x.toFixed(3)}, ${item.y.toFixed(3)})`
          : '(no pos)'
      parts.push(`- [${item.layer}] ${pos}: ${item.text}`)
    }
    if (textItems.length > 1000) {
      parts.push(`- … ${textItems.length - 1000} more positioned text items omitted`)
    }
    parts.push('')
  }

  parts.push(`## Full layer inventory (scoped)`)
  for (const layer of layers) {
    parts.push(
      `- \`${layer.name}\` kind=${layer.kind} color=${layer.colorIndex} linetype=${layer.lineType} frozen=${layer.frozen} off=${layer.off} locked=${layer.locked} entities=${layer.entityCount} texts=${layer.textCount}`,
    )
  }

  return parts.join('\n')
}

export function buildExportJson(result: ParseResult, scope: ExportScope) {
  const scopedRows = filterRowsByScope(result.rows, scope)
  return {
    fileName: result.fileName,
    format: result.format,
    scope,
    entityCount: scopedRows.length,
    extents: computeExtents(scopedRows),
    layers: enrichLayers(result.layers, scopedRows).filter(
      (l) => !scope.hiddenLayers.includes(l.name),
    ),
    textItems: collectTextItems(scopedRows),
    blocks: collectBlocks(scopedRows),
    tables: clusterTextTables(collectTextItems(scopedRows)),
    geometrySummary: summarizeGeometry(scopedRows),
    entities: scopedRows,
  }
}
