import type { TableCluster, TextItem } from './types'

type PosText = {
  handle: string
  layer: string
  text: string
  x: number
  y: number
}

export function cleanCadText(text: string): string {
  return text
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\{\\C\d+;\}/g, '')
    .replace(/\{\\[^;}]*;/g, '')
    .replace(/\\P/gi, ' ')
    .replace(/\\[Ff][^;]*;/g, '')
    .replace(/\\[A-Za-z][^;\\]*;?/g, '')
    .replace(/%%[dpc%]/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNumericCell(text: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(text.trim())
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function bandCenters(values: number[], gapThreshold: number): number[] {
  if (values.length === 0) return []
  const sorted = [...values].sort((a, b) => a - b)
  const bands: number[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = bands[bands.length - 1]
    if (sorted[i] - prev[prev.length - 1] > gapThreshold) bands.push([sorted[i]])
    else prev.push(sorted[i])
  }
  return bands.map((band) => band.reduce((s, v) => s + v, 0) / band.length)
}

/** Ignore CAD quantization noise when estimating row/column pitch. */
function estimatePitch(gaps: number[]): number | null {
  const large = gaps.filter((g) => g >= 0.75)
  if (large.length < 3) {
    const exact = gaps.filter((g) => g >= 0.05)
    if (exact.length === 0) return null
    return median(exact)
  }
  const buckets = new Map<number, number>()
  for (const g of large) {
    const b = Math.round(g * 2) / 2
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  let best: number | null = null
  let bestN = 0
  for (const [bucket, count] of buckets) {
    if (count > bestN) {
      best = bucket
      bestN = count
    }
  }
  return best
}

/**
 * Threshold between "same band" and "next row/column".
 * Uses dominant pitch so tiny float jitter (0.001) cannot collapse the grid.
 */
function gapThreshold(values: number[], fallback: number): number {
  const sorted = [...new Set(values.map((v) => Number(v.toFixed(4))))].sort(
    (a, b) => a - b,
  )
  if (sorted.length < 3) return fallback
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1]
    if (g > 1e-9) gaps.push(g)
  }
  if (gaps.length === 0) return fallback
  gaps.sort((a, b) => a - b)

  const pitch = estimatePitch(gaps)
  if (pitch && pitch > 0) {
    return Math.max(Math.min(pitch * 0.4, pitch - 0.05), fallback)
  }

  const meaningful = gaps.filter((g) => g >= 0.05)
  const minGap = meaningful[0] ?? gaps[0]
  return Math.max(minGap * 0.55, fallback)
}

function nearestIndex(value: number, centers: number[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(centers[i] - value)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function looksLikeStationHeaders(values: string[]): boolean {
  const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  if (nums.length < 3) return false
  let increasing = 0
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] >= nums[i - 1] - 1e-9) increasing++
  }
  const stepHits = nums.filter(
    (n) =>
      Math.abs(n % 25) < 0.051 ||
      Math.abs(n % 10) < 0.051 ||
      Math.abs(n % 5) < 0.051,
  ).length
  return (
    increasing / Math.max(nums.length - 1, 1) >= 0.8 &&
    stepHits / nums.length >= 0.45
  )
}

const INDEX_HEADER_RE =
  /\b(s\.?\s*nos?|drawing\s*title|drawing\s*no\.?|sheet\s*no\.?|remarks|description|rev\.?|revision|scale|date|title)\b/i

function looksLikeIndexHeaderRow(cells: string[]): boolean {
  const nonempty = cells.map((c) => c.trim()).filter(Boolean)
  if (nonempty.length < 3) return false
  const hits = nonempty.filter((c) => INDEX_HEADER_RE.test(c)).length
  const numeric = nonempty.filter(isNumericCell).length
  return hits >= 2 && numeric / nonempty.length <= 0.25
}

function splitAlongAxis(
  items: PosText[],
  axis: 'x' | 'y',
  minSplitGap: number,
): PosText[][] {
  if (items.length < 6) return items.length >= 4 ? [items] : []

  const values = items.map((i) => (axis === 'x' ? i.x : i.y))
  const sortedVals = [...values].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sortedVals.length; i++) {
    const g = sortedVals[i] - sortedVals[i - 1]
    if (g > 1e-9) gaps.push(g)
  }
  if (gaps.length === 0) return [items]

  // Pitch from "normal" gaps only — exclude the gutter we want to split on,
  // otherwise median*N balloons and side-by-side tables never separate.
  const med = median(gaps)
  const localGaps = gaps.filter((g) => g <= med * 3)
  const pitch = estimatePitch(localGaps.length >= 3 ? localGaps : gaps) ?? med
  const splitGap = Math.max(pitch * 5, minSplitGap)

  const sorted = [...items].sort((a, b) =>
    axis === 'x' ? a.x - b.x : a.y - b.y,
  )
  const regions: PosText[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = regions[regions.length - 1]
    const prevEdge = axis === 'x' ? prev[prev.length - 1].x : prev[prev.length - 1].y
    const nextEdge = axis === 'x' ? sorted[i].x : sorted[i].y
    if (nextEdge - prevEdge > splitGap) regions.push([sorted[i]])
    else prev.push(sorted[i])
  }
  return regions.filter((r) => r.length >= 6)
}

/**
 * Split by Y first (stacked sheets / profile vs plan), then by X inside each
 * band so two unrelated tables sharing a Y-range stay separate.
 */
function splitSpatialRegions(items: PosText[]): PosText[][] {
  // Floor ~35 keeps STATION headers with the datasheet body (~25 units above)
  // while still separating plan callouts hundreds of units away.
  const yRegions = splitAlongAxis(items, 'y', 35)
  const out: PosText[][] = []
  for (const region of yRegions) {
    // X floor ~80: side-by-side tables with a clear gutter, not normal column pitch.
    const xRegions = splitAlongAxis(region, 'x', 80)
    out.push(...xRegions)
  }
  return out
}

/** Drop lone title/annotation rows that sit inside a dense data block. */
function dropSparseTitleRows(items: PosText[]): PosText[] {
  if (items.length < 8) return items
  const ys = items.map((i) => i.y)
  const yThresh = gapThreshold(ys, 0.35)
  const centers = bandCenters(ys, yThresh)
  if (centers.length < 3) return items

  const bands: PosText[][] = centers.map(() => [])
  for (const item of items) {
    bands[nearestIndex(item.y, centers)].push(item)
  }
  const denseCounts = bands.map((b) => b.length).filter((n) => n >= 3)
  if (denseCounts.length < 2) return items
  const medDense = median(denseCounts)

  return items.filter((item) => {
    const band = bands[nearestIndex(item.y, centers)]
    if (band.length >= Math.max(3, medDense * 0.45)) return true
    // Sparse band: keep short labels/numbers, drop long centered titles.
    if (isNumericCell(item.text) || item.text.length <= 8) return true
    return !/(section|detail|scale|plan|profile|cross|title|drawing)/i.test(
      item.text,
    )
  })
}

function looksLikeTextHeaderRow(cells: string[]): boolean {
  const nonempty = cells.map((c) => c.trim()).filter(Boolean)
  if (nonempty.length < 3) return false
  const numeric = nonempty.filter(isNumericCell).length
  const alpha = nonempty.filter((c) => /[A-Za-z]{2,}/.test(c)).length
  return alpha >= 3 && numeric / nonempty.length <= 0.25
}

function buildGrid(
  items: PosText[],
  options?: { joinCells?: boolean },
): {
  colCenters: number[]
  rowCenters: number[]
  grid: string[][]
} | null {
  const joinCells = options?.joinCells ?? false
  const xs = items.map((i) => i.x)
  const ys = items.map((i) => i.y)
  const xThresh = gapThreshold(xs, 0.5)
  const yThresh = gapThreshold(ys, 0.35)
  const colCenters = bandCenters(xs, xThresh)
  const rowCenters = bandCenters(ys, yThresh).sort((a, b) => b - a) // top → bottom

  if (colCenters.length < 2 || rowCenters.length < 2) return null

  const grid: string[][] = rowCenters.map(() => colCenters.map(() => ''))
  const scores: number[][] = rowCenters.map(() => colCenters.map(() => -1))
  const buckets: Array<Array<Array<{ text: string; x: number }>>> = rowCenters.map(
    () => colCenters.map(() => []),
  )

  for (const item of items) {
    const r = nearestIndex(item.y, rowCenters)
    const c = nearestIndex(item.x, colCenters)
    const maxXDist = Math.max(xThresh * 1.6, 1)
    const maxYDist = Math.max(yThresh * 1.6, 0.8)
    if (Math.abs(item.x - colCenters[c]) > maxXDist) continue
    if (Math.abs(item.y - rowCenters[r]) > maxYDist) continue

    if (joinCells) {
      buckets[r][c].push({ text: item.text, x: item.x })
      continue
    }

    const score = item.text.length + (isNumericCell(item.text) ? 0.5 : 0)
    if (score >= scores[r][c]) {
      scores[r][c] = score
      grid[r][c] = item.text
    }
  }

  if (joinCells) {
    for (let r = 0; r < rowCenters.length; r++) {
      for (let c = 0; c < colCenters.length; c++) {
        const parts = buckets[r][c]
          .sort((a, b) => a.x - b.x)
          .map((p) => p.text.trim())
          .filter(Boolean)
        grid[r][c] = parts.join(' ').replace(/\s+/g, ' ')
      }
    }
  }

  return { colCenters, rowCenters, grid }
}

function mergeStackedRowLabels(grid: string[][]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i]
    const label = row[0]?.trim() ?? ''
    const hasData = row.slice(1).some((c) => c.trim())

    if (!hasData && label && i + 1 < grid.length) {
      const next = [...grid[i + 1]]
      const nextLabel = next[0]?.trim() ?? ''
      next[0] = [label, nextLabel].filter(Boolean).join(' ').replace(/\s+/g, ' ')
      grid[i + 1] = next
      continue
    }
    out.push(row)
  }
  return out
}

/**
 * Drawing-index / schedule tables: column centers come from the header row so
 * multi-fragment titles (PART 1 + FROM ST… + 250 MM HDPE) stay in one cell.
 */
function extractHeaderAnchoredTable(
  items: PosText[],
  layer: string,
): TableCluster | null {
  const ys = items.map((i) => i.y)
  const yThresh = gapThreshold(ys, 0.35)
  const rowCenters = bandCenters(ys, yThresh).sort((a, b) => b - a)
  if (rowCenters.length < 3) return null

  const rows: PosText[][] = rowCenters.map(() => [])
  for (const item of items) {
    rows[nearestIndex(item.y, rowCenters)].push(item)
  }

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const texts = rows[i].map((t) => t.text)
    if (looksLikeIndexHeaderRow(texts)) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return null

  const headerItems = [...rows[headerIdx]].sort((a, b) => a.x - b.x)
  // One header cell per x-band (avoid "DRAWING"+"TITLE" as two columns if split)
  const headerXThresh = Math.max(gapThreshold(headerItems.map((h) => h.x), 2), 4)
  const headerBands: PosText[][] = [[headerItems[0]]]
  for (let i = 1; i < headerItems.length; i++) {
    const prev = headerBands[headerBands.length - 1]
    if (headerItems[i].x - prev[prev.length - 1].x > headerXThresh) {
      headerBands.push([headerItems[i]])
    } else {
      prev.push(headerItems[i])
    }
  }

  const colCenters = headerBands.map(
    (band) => band.reduce((s, t) => s + t.x, 0) / band.length,
  )
  const headers = headerBands.map((band) =>
    band
      .sort((a, b) => a.x - b.x)
      .map((t) => t.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  if (colCenters.length < 2) return null

  // Boundaries between header columns. Wide title/description columns keep more
  // width when followed by a narrow ID column (so "250 MM HDPE" stays under TITLE).
  const bounds: number[] = []
  for (let i = 0; i < colCenters.length - 1; i++) {
    const left = headers[i]
    const right = headers[i + 1]
    const span = colCenters[i + 1] - colCenters[i]
    const mid = colCenters[i] + span * 0.5
    if (
      /title|description|name/i.test(left) &&
      /\bno\.?\b|number|sheet|rev/i.test(right)
    ) {
      bounds.push(colCenters[i] + span * 0.78)
    } else {
      bounds.push(mid)
    }
  }

  function colForX(x: number): number {
    for (let i = 0; i < bounds.length; i++) {
      if (x < bounds[i]) return i
    }
    return colCenters.length - 1
  }

  const body: string[][] = []
  for (let r = 0; r < rows.length; r++) {
    if (r === headerIdx) continue
    const cells: Array<Array<{ text: string; x: number }>> = headers.map(() => [])
    for (const item of rows[r]) {
      cells[colForX(item.x)].push({ text: item.text, x: item.x })
    }
    const line = cells.map((parts) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' '),
    )
    if (line.some(Boolean)) body.push(line)
  }

  if (body.length < 2) return null

  // Drop trailing empty columns (e.g. empty REMARKS)
  const keep = headers.map((_, idx) =>
    Boolean(headers[idx]?.trim()) || body.some((r) => Boolean(r[idx]?.trim())),
  )
  const keptHeaders = headers.filter((_, idx) => keep[idx])
  const keptBody = body.map((r) => r.filter((_, idx) => keep[idx]))

  const numericCells = keptBody.flat().filter(isNumericCell).length
  const textCells = keptBody.flat().filter((c) => c && !isNumericCell(c)).length
  // Index tables are text-heavy; don't require a numeric matrix.
  if (textCells < 3 && numericCells < 4) return null

  const confidence =
    0.45 +
    Math.min(0.25, keptBody.length / 10) +
    Math.min(0.15, keptHeaders.length / 8) +
    (keptHeaders.some((h) => /drawing\s*title/i.test(h)) ? 0.15 : 0)

  return {
    layer,
    title: `Drawing index on ${layer}`,
    headers: keptHeaders,
    rowCount: keptBody.length,
    colCount: keptHeaders.length,
    rows: [keptHeaders, ...keptBody],
    confidence: Math.min(confidence, 0.95),
  }
}

function extractDatasheetTable(rawItems: PosText[], layer: string): TableCluster | null {
  const items = dropSparseTitleRows(rawItems)
  const built = buildGrid(items)
  if (!built) return null
  let { grid } = built
  if (grid.length < 2 || grid[0].length < 2) return null

  const leftCol = grid.map((r) => r[0] ?? '')
  grid = mergeStackedRowLabels(grid)

  let headerRowIndex = grid.findIndex((r) => /^station\b/i.test(r[0]?.trim() ?? ''))
  if (headerRowIndex < 0) {
    headerRowIndex = grid.findIndex((r) => /\bstation\b/i.test(r[0] ?? ''))
  }
  if (headerRowIndex < 0) {
    for (let i = grid.length - 1; i >= 0; i--) {
      if (looksLikeStationHeaders(grid[i].slice(1))) {
        headerRowIndex = i
        break
      }
    }
  }
  if (headerRowIndex < 0) {
    // Prefer a top text header row (CHAIN / OFFSET / EL …) over inventing Col N.
    const top = Math.min(3, grid.length)
    for (let i = 0; i < top; i++) {
      if (looksLikeTextHeaderRow(grid[i])) {
        headerRowIndex = i
        break
      }
    }
  }

  let headers: string[]
  let body: string[][]

  if (headerRowIndex >= 0) {
    const headerVals = grid[headerRowIndex]
      .slice(1)
      .map((c, idx) => c.trim() || `Col ${idx + 1}`)
    headers = ['Item', ...headerVals]
    body = grid
      .filter((_, idx) => idx !== headerRowIndex)
      .map((r) => [r[0]?.trim() || '', ...r.slice(1).map((c) => c.trim())])
      .filter((r) => r[0] || r.slice(1).some(Boolean))
  } else {
    headers = ['Item', ...grid[0].slice(1).map((_, idx) => `Col ${idx + 1}`)]
    body = grid.map((r) => [r[0]?.trim() || '', ...r.slice(1).map((c) => c.trim())])
  }

  body = body.filter((r) => r[0] || r.slice(1).some(Boolean))
  if (body.length < 2) return null

  const labeledRows = body.filter((r) => r[0]?.trim())
  if (labeledRows.length < 2) return null

  const valueCols = headers.length - 1
  if (valueCols < 2) return null
  const numericCells = body.flatMap((r) => r.slice(1)).filter(isNumericCell)
  if (numericCells.length < 4) return null

  const keepCol = headers.map((_, idx) => {
    if (idx === 0) return true
    return (
      Boolean(headers[idx]?.trim()) ||
      body.some((r) => Boolean(r[idx]?.trim()))
    )
  })
  headers = headers.filter((_, idx) => keepCol[idx])
  body = body.map((r) => r.filter((_, idx) => keepCol[idx]))

  const confidence =
    (headerRowIndex >= 0 ? 0.4 : 0.1) +
    (leftCol.some((t) => /elev|depth|pipe|ground|station/i.test(t)) ? 0.2 : 0) +
    Math.min(0.25, body.length / 12) +
    Math.min(0.15, (headers.length - 1) / 80)

  return {
    layer,
    title: `Labeled table on ${layer}`,
    headers,
    rowCount: body.length,
    colCount: headers.length,
    rows: [headers, ...body],
    confidence,
  }
}

/** Two identical numeric columns = profile axis / scale bar, not a data table. */
export function isAxisOrRulerTable(table: TableCluster): boolean {
  const body = table.rows.slice(1)
  if (body.length < 4) return false

  const filledCells = body.flat().map((c) => c.trim()).filter(Boolean)
  if (filledCells.length < 8) return false
  const numericRatio =
    filledCells.filter(isNumericCell).length / filledCells.length
  // Drawing indexes share S.NO / DRAWING NO. digits but are text-heavy — keep them.
  if (numericRatio < 0.75) return false

  const start =
    table.headers[0] === 'Item' || /^item$/i.test(table.headers[0] ?? '') ? 1 : 0
  const cols: string[][] = []
  for (let c = start; c < table.headers.length; c++) {
    cols.push(body.map((r) => (r[c] ?? '').trim()))
  }
  if (cols.length < 1) return false

  const mostlyNumeric = (col: string[]) => {
    const filled = col.filter(Boolean)
    if (filled.length < 4) return false
    return filled.filter(isNumericCell).length / filled.length >= 0.85
  }

  // Duplicate columns (left/right scale bars).
  for (let i = 0; i < cols.length; i++) {
    if (!mostlyNumeric(cols[i])) continue
    for (let j = i + 1; j < cols.length; j++) {
      if (!mostlyNumeric(cols[j])) continue
      if (
        cols[i].length === cols[j].length &&
        cols[i].every((v, k) => v === cols[j][k])
      ) {
        return true
      }
    }
  }

  // Single dense monotonic integer ladder (elevation tick marks).
  if (cols.length <= 2 && cols.some(mostlyNumeric)) {
    const col = cols.find(mostlyNumeric)!
    const nums = col.map(Number).filter((n) => Number.isFinite(n))
    if (nums.length >= 8) {
      let steps = 0
      for (let i = 1; i < nums.length; i++) {
        const d = nums[i] - nums[i - 1]
        if (Math.abs(d - 1) < 1e-6 || Math.abs(d + 1) < 1e-6) steps++
      }
      const labelish = body.filter((r) => {
        const label = start === 1 ? r[0] : ''
        return (
          Boolean(label) &&
          !isNumericCell(label) &&
          !/^(level|datum|elev)/i.test(label)
        )
      }).length
      if (steps / Math.max(nums.length - 1, 1) >= 0.75 && labelish <= 1) return true
    }
  }

  return false
}

function extractLabeledTable(items: PosText[], layer: string): TableCluster | null {
  // Prefer schedule/index layout when a real header row is present.
  const indexTable = extractHeaderAnchoredTable(items, layer)
  if (indexTable && !isAxisOrRulerTable(indexTable)) return indexTable

  const datasheet = extractDatasheetTable(items, layer)
  if (datasheet && !isAxisOrRulerTable(datasheet)) return datasheet
  return null
}

export function clusterTextTables(textItems: TextItem[]): TableCluster[] {
  const cleaned: PosText[] = []
  for (const item of textItems) {
    if (item.x == null || item.y == null) continue
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue
    const text = cleanCadText(item.text)
    if (!text) continue
    cleaned.push({
      handle: item.handle,
      layer: item.layer,
      text,
      x: item.x,
      y: item.y,
    })
  }
  if (cleaned.length < 6) return []

  const byLayer = new Map<string, PosText[]>()
  for (const item of cleaned) {
    const list = byLayer.get(item.layer) ?? []
    list.push(item)
    byLayer.set(item.layer, list)
  }

  const tables: TableCluster[] = []

  for (const [layer, items] of byLayer) {
    for (const region of splitSpatialRegions(items)) {
      const table = extractLabeledTable(region, layer)
      if (table) tables.push(table)
    }
  }

  tables.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.colCount * b.rowCount - a.colCount * a.rowCount,
  )

  const kept: TableCluster[] = []
  for (const table of tables) {
    if (isAxisOrRulerTable(table)) continue
    // Only collapse near-identical grids (same headers), not unrelated
    // side-by-side tables that happen to share row/col counts.
    const duplicate = kept.some((k) => {
      if (k.layer !== table.layer) return false
      if (Math.abs(k.rowCount - table.rowCount) > 2) return false
      if (k.colCount < table.colCount * 0.75) return false
      const a = k.headers.join('\0')
      const b = table.headers.join('\0')
      return a === b || (k.headers[0] === table.headers[0] && k.colCount === table.colCount)
    })
    if (!duplicate) kept.push(table)
  }

  return kept
}

export function tableToMarkdown(table: TableCluster, maxCols = 40): string {
  const matrix = table.rows
  if (matrix.length === 0) return ''

  const totalCols = matrix[0].length
  const clipped = totalCols > maxCols + 1
  const header = clipped
    ? [...matrix[0].slice(0, maxCols + 1), `…(+${totalCols - maxCols - 1} cols)`]
    : matrix[0]
  const body = matrix.slice(1).map((row) => {
    const cells = clipped
      ? [...row.slice(0, maxCols + 1), '']
      : row
    while (cells.length < header.length) cells.push('')
    return cells.slice(0, header.length)
  })

  return [
    `### ${table.title ?? `Table on \`${table.layer}\``}`,
    '',
    `_Layer \`${table.layer}\` · ${table.rowCount} data rows · ${Math.max(table.colCount - 1, 0)} value columns · confidence ${(table.confidence * 100).toFixed(0)}%_`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
    clipped
      ? `\n_Preview shows first ${maxCols} value columns. Download table CSV for the full grid._`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function tableToCsv(table: TableCluster): string {
  const escape = (value: string) => {
    const s = value ?? ''
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return table.rows.map((row) => row.map(escape).join(',')).join('\n')
}
