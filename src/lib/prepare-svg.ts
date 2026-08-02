export type SvgViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

export function parseSvgViewBox(svg: string): SvgViewBox | null {
  const match = svg.match(/viewBox="([^"]+)"/i)
  if (!match) return null
  const parts = match[1].trim().split(/[\s,]+/).map(Number)
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null
  if (parts[2] <= 0 || parts[3] <= 0) return null
  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  }
}

/**
 * Large survey coordinates (e.g. 543000, 2772000) destroy browser SVG text
 * precision and turn labels into white blobs. Shift geometry near the origin
 * while keeping the original world origin on data-* attributes for mapping.
 */
export function prepareSvgForPreview(
  svg: string,
  handleToLayer: Map<string, string> = new Map(),
): string {
  if (!svg.trim()) return ''

  let out = svg.replace(/<\?xml[^?]*\?>\s*/i, '')
  out = out.replace(/\swidth="[^"]*"/gi, '').replace(/\sheight="[^"]*"/gi, '')

  if (handleToLayer.size > 0) {
    out = out.replace(/<g\b([^>]*)>/g, (full, attrs: string) => {
      if (/\bdata-layer=/.test(attrs)) return full
      const idMatch = attrs.match(/\bid="([^"]+)"/)
      if (!idMatch) return full
      const layer = handleToLayer.get(idMatch[1])
      if (!layer) return full
      const safe = layer
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
      return `<g data-layer="${safe}"${attrs}>`
    })
  }

  out = out
    .replaceAll('stroke="rgb(255,255,255)"', 'stroke="rgb(226,232,240)"')
    .replaceAll('fill="rgb(255,255,255)"', 'fill="rgb(248,250,252)"')
    .replace(/stroke-width="0\.1%"/g, 'stroke-width="0.5%"')
    // AutoCAD diameter symbol in SVG text (legend: PO-%%C250).
    .replaceAll('%%C', 'Ø')

  // LibreDWG often strokes glyphs; kill stroke only. Keep fill so legend
  // colors (cyan/yellow/blue/red pipe samples) inherit from the parent <g>.
  out = out.replace(
    /<text\b/g,
    '<text stroke="none" stroke-width="0" font-family="Arial, Helvetica, sans-serif"',
  )

  const world = parseSvgViewBox(out)
  if (world) {
    out = out.replace(
      /viewBox="[^"]*"/i,
      `viewBox="0 0 ${world.width} ${world.height}"`,
    )

    out = out.replace(
      /<svg\b([^>]*)>/i,
      `<svg$1 width="100%" height="100%" data-origin-x="${world.minX}" data-origin-y="${world.minY}" data-world-width="${world.width}" data-world-height="${world.height}" style="background:#0b1220;display:block">`,
    )

    // Shift all drawing content into local coordinates near (0,0).
    out = out.replace(
      /(<svg\b[^>]*>)/i,
      `$1<g id="cad-local" transform="translate(${-world.minX},${-world.minY})">`,
    )
    out = out.replace(/<\/svg>\s*$/i, '</g></svg>')
  } else {
    out = out.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="100%" height="100%" style="background:#0b1220;display:block">',
    )
  }

  return out
}

export function parseSvgOrigin(svg: string): { x: number; y: number } {
  const x = Number(svg.match(/data-origin-x="([^"]+)"/)?.[1] ?? 0)
  const y = Number(svg.match(/data-origin-y="([^"]+)"/)?.[1] ?? 0)
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  }
}
