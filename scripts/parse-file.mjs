import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/parse-file.mjs <file.dwg>')
  process.exit(1)
}

function json(value) {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  )
}

function compact(value) {
  return JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  )
}

const outDir = join(process.cwd(), 'output')
mkdirSync(outDir, { recursive: true })

const wasmDir = join(process.cwd(), 'node_modules/@mlightcad/libredwg-web/wasm')
const libredwg = await LibreDwg.create(wasmDir)
const buffer = readFileSync(filePath)
const dwgPtr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG)
if (dwgPtr == null) {
  console.error('Failed to read DWG')
  process.exit(1)
}

try {
  const { database: db, stats } = libredwg.convertEx(dwgPtr)
  const entities = db.entities ?? []
  const layers = db.tables?.LAYER?.entries ?? []
  const typeCounts = {}
  for (const e of entities) {
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1
  }

  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const rows = entities.map((e) => {
    const text = e.text ?? e.textOverride ?? ''
    return {
      handle: e.handle ?? '',
      type: e.type ?? '',
      layer: e.layer ?? '',
      colorIndex: e.colorIndex ?? '',
      lineType: e.lineType ?? 'BYLAYER',
      text,
      blockName: e.type === 'INSERT' ? e.name ?? '' : '',
      geometry: compact(e),
    }
  })

  const csv = [
    'handle,type,layer,colorIndex,lineType,text,blockName,geometry',
    ...rows.map((r) =>
      [r.handle, r.type, r.layer, r.colorIndex, r.lineType, r.text, r.blockName, r.geometry]
        .map(escape)
        .join(','),
    ),
  ].join('\n')

  const texts = [...new Set(rows.map((r) => String(r.text).trim()).filter(Boolean))]
  const base = basename(filePath, '.dwg')
  const ai = `# DWG drawing context for AI

## File
- name: ${basename(filePath)}
- entity_count: ${entities.length}
- layer_count: ${layers.length}
- unknown_entities_skipped: ${stats.unknownEntityCount}

## Entity type counts
${Object.entries(typeCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([t, c]) => `- ${t}: ${c}`)
  .join('\n')}

## Layers
${layers
  .map(
    (l) =>
      `- ${l.name} (colorIndex=${l.colorIndex}, frozen=${l.frozen}, off=${l.off}, locked=${l.locked}, linetype=${l.lineType})`,
  )
  .join('\n')}

## Extracted text (unique)
${texts.length ? texts.map((t) => `- ${t}`).join('\n') : '(none)'}

## Header
\`\`\`json
${json(db.header ?? {})}
\`\`\`

## Full entities
\`\`\`json
${json(entities)}
\`\`\`
`

  const csvPath = join(outDir, `${base}.csv`)
  const aiPath = join(outDir, `${base}-ai-context.md`)
  const jsonPath = join(outDir, `${base}.json`)
  writeFileSync(csvPath, csv)
  writeFileSync(aiPath, ai)
  writeFileSync(
    jsonPath,
    json({ header: db.header, layers, entities, objects: db.objects, classes: db.classes }),
  )

  console.log(
    json({
      file: basename(filePath),
      entities: entities.length,
      layers: layers.length,
      unknownEntityCount: stats.unknownEntityCount,
      typeCounts,
      texts: texts.length,
      csvPath,
      aiPath,
      jsonPath,
    }),
  )
} finally {
  libredwg.dwg_free(dwgPtr)
}

