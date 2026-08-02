/** Legend colors for HDPE pipe diameters (from drawing legend). */
const DIAMETER_RGB: Record<string, string> = {
  '250': 'rgb(34,197,94)', // green
  '400': 'rgb(234,179,8)', // yellow
  '500': 'rgb(59,130,246)', // blue
  '600': 'rgb(239,68,68)', // red
  // Other sizes seen in network KMZ exports (distinct, not in legend)
  '110': 'rgb(148,163,184)',
  '160': 'rgb(45,212,191)',
  '200': 'rgb(249,115,22)',
}

const FALLBACK_RGB = 'rgb(226,232,240)'

export function normalizeDiameter(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/&lt;Null&gt;/gi, '').replace(/[^\d.]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return String(Math.round(n))
}

export function pipeLayerName(diameter: string | null): string {
  return diameter ? `PO-Ø${diameter} HDPE` : 'Unknown diameter'
}

export function pipeColorRgb(diameter: string | null): string {
  if (!diameter) return FALLBACK_RGB
  return DIAMETER_RGB[diameter] ?? FALLBACK_RGB
}

export function pipeLegendLines(): string[] {
  return [
    'PO-Ø250 HDPE → green',
    'PO-Ø400 HDPE → yellow',
    'PO-Ø500 HDPE → blue',
    'PO-Ø600 HDPE → red',
  ]
}
