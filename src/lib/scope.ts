import type { EntityRow, ExportScope, RegionBox } from './types'

function pointInRegion(x: number | null, y: number | null, region: RegionBox): boolean {
  if (x == null || y == null) return false
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY
}

export function rowInScope(row: EntityRow, scope: ExportScope): boolean {
  if (scope.hiddenLayers.includes(row.layer)) return false
  if (!scope.region) return true

  const a = pointInRegion(row.x, row.y, scope.region)
  const b = pointInRegion(row.x2, row.y2, scope.region)
  return a || b
}

export function filterRowsByScope(rows: EntityRow[], scope: ExportScope): EntityRow[] {
  return rows.filter((row) => rowInScope(row, scope))
}

export function describeScope(scope: ExportScope, totalLayers: number): string {
  const hidden = scope.hiddenLayers.length
  const visibleLayers = Math.max(totalLayers - hidden, 0)
  const region = scope.region
    ? `region (${scope.region.minX.toFixed(2)}, ${scope.region.minY.toFixed(2)}) → (${scope.region.maxX.toFixed(2)}, ${scope.region.maxY.toFixed(2)})`
    : 'full drawing extents'
  return `Visible layers: ${visibleLayers}/${totalLayers}; spatial scope: ${region}`
}
