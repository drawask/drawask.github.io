import assert from 'node:assert/strict'
import { enrichLayers } from './smart-extract.ts'
import { clusterTextTables } from './table-detect.ts'
import type { EntityRow, TextItem } from './types.ts'

/** Synthetic excavation / station table matching PRINT 250 KHZAN layout. */
function buildExcavationFixture(): TextItem[] {
  const items: TextItem[] = []
  const stations = [0, 25, 50, 75, 100, 125]
  const baseX = 100
  const labelX = 10
  const colPitch = 25

  const push = (text: string, x: number, y: number) => {
    items.push({
      handle: `${items.length}`,
      layer: 'C-LABELS',
      type: 'TEXT',
      text,
      x,
      y,
    })
  }

  // Stacked labels + values (top → bottom in CAD Y-up)
  push('GROUND', labelX, 100)
  push('ELEVATION', labelX, 94)
  stations.forEach((s, i) => push(String(700 - i * 0.2), baseX + i * colPitch, 94))

  push('TOP PIPE', labelX, 80)
  push('ELEVATION', labelX, 74)
  stations.forEach((s, i) => push(String(690 - i * 0.2), baseX + i * colPitch, 74))

  push('INVERT PIPE', labelX, 60)
  push('ELEVATION', labelX, 54)
  stations.forEach((s, i) => push(String(680 - i * 0.2), baseX + i * colPitch, 54))

  push('DEPTH TO TOP', labelX, 40)
  stations.forEach((_s, i) => push('1.50', baseX + i * colPitch, 40))

  push('DEPTH TO EXC', labelX, 30)
  stations.forEach((_s, i) => push('1.90', baseX + i * colPitch, 30))

  // Junk MTEXT color codes should be ignored
  stations.forEach((_s, i) => push('{\\C5;}', baseX + i * colPitch, 35))

  push('STATION', labelX, 10)
  stations.forEach((s, i) => push(s.toFixed(3), baseX + i * colPitch, 10))

  return items
}

const clusters = clusterTextTables(buildExcavationFixture())
assert.ok(clusters.length >= 1, 'expected at least one table')
const table = clusters[0]
assert.equal(table.headers[0], 'Item')
assert.deepEqual(table.headers.slice(1, 5), ['0.000', '25.000', '50.000', '75.000'])
assert.ok(
  table.rows.some((r) => r[0] === 'GROUND ELEVATION'),
  `expected merged GROUND ELEVATION, got ${table.rows.map((r) => r[0]).join(' | ')}`,
)
assert.ok(table.rows.some((r) => r[0] === 'TOP PIPE ELEVATION'))
assert.ok(table.rows.some((r) => r[0] === 'DEPTH TO TOP'))
assert.ok(table.rows.some((r) => r[0] === 'DEPTH TO EXC'))
assert.ok(!table.rows.slice(1).some((r) => /^station$/i.test(r[0])), 'STATION should be header, not body')
const ground = table.rows.find((r) => r[0] === 'GROUND ELEVATION')!
assert.equal(ground[1], '700')
assert.equal(ground[2], '699.8')

const rows = buildExcavationFixture().map(
  (t) =>
    ({
      handle: t.handle,
      type: t.type,
      layer: t.layer,
      colorIndex: '',
      color: '',
      lineType: '',
      visible: 'true',
      text: t.text,
      blockName: '',
      attributes: '',
      geometry: '',
      details: '',
      x: t.x,
      y: t.y,
      x2: null,
      y2: null,
    }) satisfies EntityRow,
)

const layers = enrichLayers(
  [
    {
      name: 'C-LABELS',
      colorIndex: 7,
      frozen: false,
      off: false,
      locked: false,
      lineType: 'Continuous',
    },
  ],
  rows,
)
assert.equal(layers.find((l) => l.name === 'C-LABELS')?.likelyAnswer, true)

console.log('smart-extract.test.ts: ok')
console.log(
  'table preview:',
  table.rows.map((r) => r.slice(0, 4).join(' | ')).join('\n'),
)
