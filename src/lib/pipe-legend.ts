/**
 * Pipe diameter colors from PRINT 250 KHZAN.dwg legend (true RGB):
 * PO-Ø250 → cyan, PO-Ø400 → yellow, PO-Ø500 → blue, PO-Ø600 → red.
 */
const DIAMETER_RGB: Record<string, string> = {
  '250': 'rgb(0,255,255)',
  '400': 'rgb(255,255,0)',
  '500': 'rgb(0,0,255)',
  '600': 'rgb(255,0,0)',
  // Other sizes seen in network KMZ exports (distinct, not in sheet legend)
  '110': 'rgb(148,163,184)',
  '160': 'rgb(45,212,191)',
  '200': 'rgb(249,115,22)',
}

const DIAMETER_NAME: Record<string, string> = {
  '250': 'cyan',
  '400': 'yellow',
  '500': 'blue',
  '600': 'red',
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
  return Object.entries(DIAMETER_NAME).map(
    ([mm, name]) => `PO-Ø${mm} HDPE → ${name} (${DIAMETER_RGB[mm]})`,
  )
}
