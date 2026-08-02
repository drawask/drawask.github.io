import assert from 'node:assert/strict'
import {
  cleanCadText,
  clusterTextTables,
  isAxisOrRulerTable,
} from './table-detect.ts'
import type { TableCluster, TextItem } from './types.ts'

function push(
  items: TextItem[],
  text: string,
  x: number,
  y: number,
  layer = '0',
) {
  items.push({
    handle: `${items.length}`,
    layer,
    type: 'TEXT',
    text,
    x,
    y,
  })
}

/** Drawing index: multi-fragment title under one header column. */
function buildDrawingIndex(): TextItem[] {
  const items: TextItem[] = []
  // Header row
  push(items, 'S.NOs', 28.25, 162)
  push(items, 'DRAWING TITLE', 55.3, 162)
  push(items, 'DRAWING NO.', 167.64, 162)
  push(items, 'SHEET NO.', 195.23, 162)
  push(items, 'REMARKS', 215.66, 162)

  const rows = [
    { sno: '1', title: [['COVER PAGE', 51.82]], no: '1', y: 155 },
    { sno: '2', title: [['LIST', 51.94]], no: '2', y: 149 },
    { sno: '3', title: [['ALL SITE PLAN', 52.08]], no: '3', y: 142.6 },
    {
      sno: '4',
      title: [
        ['PART 1', 52.33],
        ['FROM ST 0+000 TO 1+000', 67.74],
        ['250 MM HDPE', 121.67],
      ],
      no: '4',
      y: 135.1,
    },
    {
      sno: '5',
      title: [
        ['PART 2', 51.79],
        ['FROM ST 1+000 TO 2+000', 67.74],
        ['250 MM HDPE', 121.67],
      ],
      no: '5',
      y: 128.5,
    },
    {
      sno: '6',
      title: [
        ['PART 3', 51.79],
        ['FROM ST 2+000 TO 3+000', 67.74],
        ['250 MM HDPE', 121.67],
      ],
      no: '6',
      y: 122,
    },
  ]

  for (const row of rows) {
    push(items, row.sno, 33.5, row.y)
    for (const [text, x] of row.title) push(items, text, x, row.y)
    push(items, row.no, 177.7, row.y)
  }

  return items
}

/** Twin elevation scale bars (not a data table). */
function buildAxisRuler(): TextItem[] {
  const items: TextItem[] = []
  push(items, 'Level', 100, 800, 'C-PROFILEVIEWS_Text')
  for (let i = 0; i <= 20; i++) {
    const v = String(690 + i)
    const y = 100 + i * 10
    push(items, v, 100, y, 'C-PROFILEVIEWS_Text')
    push(items, v, 500, y, 'C-PROFILEVIEWS_Text')
  }
  return items
}

assert.equal(cleanCadText('{\\C5;}'), '')
assert.equal(cleanCadText('GL:700.948'), 'GL:700.948')

const indexTables = clusterTextTables(buildDrawingIndex())
assert.ok(indexTables.length >= 1, 'drawing index should be detected')
const index = indexTables[0]
assert.match(index.headers.join('|'), /DRAWING\s*TITLE/i)
const part1 = index.rows.find((r) => r.some((c) => /PART 1/i.test(c)))
assert.ok(part1, 'PART 1 row missing')
const titleCol = index.headers.findIndex((h) => /DRAWING\s*TITLE/i.test(h))
assert.ok(titleCol >= 0)
assert.match(
  part1[titleCol],
  /PART 1.*FROM ST 0\+000 TO 1\+000.*250 MM HDPE/i,
  `title cell misaligned: ${part1[titleCol]}`,
)
assert.ok(
  !/Col \d/.test(part1[titleCol] ?? ''),
  'title should not be split into Col N',
)

const axisTables = clusterTextTables(buildAxisRuler())
assert.equal(
  axisTables.length,
  0,
  `axis/ruler should not be a table, got ${axisTables.map((t) => t.title).join(', ')}`,
)

const fake: TableCluster = {
  layer: 'C-PROFILEVIEWS_Text',
  title: 'fake',
  headers: ['Item', 'Col 1', 'Col 2'],
  rowCount: 10,
  colCount: 3,
  confidence: 0.7,
  rows: [
    ['Item', 'Col 1', 'Col 2'],
    ...Array.from({ length: 10 }, (_, i) => ['', String(690 + i), String(690 + i)]),
  ],
}
assert.equal(isAxisOrRulerTable(fake), true)

/** Two unrelated tables at the same Y-range, different X-ranges. */
function buildSideBySide(): TextItem[] {
  const items: TextItem[] = []
  const leftX = [10, 40, 70]
  ;['ITEM', 'QTY', 'UNIT'].forEach((h, i) => push(items, h, leftX[i], 100, 'L'))
  ;(
    [
      ['PIPE', '12', 'm'],
      ['VALVE', '3', 'ea'],
      ['TEE', '6', 'ea'],
      ['BEND', '4', 'ea'],
    ] as const
  ).forEach((row, r) => {
    row.forEach((c, i) => push(items, c, leftX[i], 90 - r * 10, 'L'))
  })

  const rightX = [300, 340, 380, 420]
  ;['STATION', 'GL', 'IL', 'DEPTH'].forEach((h, i) =>
    push(items, h, rightX[i], 100, 'L'),
  )
  ;(
    [
      ['0.000', '700.1', '698.0', '2.1'],
      ['25.000', '700.0', '697.9', '2.1'],
      ['50.000', '699.8', '697.7', '2.1'],
      ['75.000', '699.6', '697.5', '2.1'],
    ] as const
  ).forEach((row, r) => {
    row.forEach((c, i) => push(items, c, rightX[i], 90 - r * 10, 'L'))
  })
  return items
}

/** Cross-section block with a title row in the middle of the data. */
function buildMidTitle(): TextItem[] {
  const items: TextItem[] = []
  const xs = [10, 40, 70, 100, 130]
  ;['CHAIN', 'OFFSET', 'EL', 'CUT', 'FILL'].forEach((h, i) =>
    push(items, h, xs[i], 200, 'XS'),
  )
  ;(
    [
      ['0', '-5', '100.2', '0.3', '0'],
      ['5', '-2', '100.1', '0.2', '0'],
      ['10', '0', '100.0', '0.1', '0'],
    ] as const
  ).forEach((row, r) => {
    row.forEach((c, i) => push(items, c, xs[i], 190 - r * 8, 'XS'))
  })
  push(items, 'CROSS SECTION A-A', 70, 162, 'XS')
  ;(
    [
      ['15', '2', '99.9', '0', '0.1'],
      ['20', '5', '99.8', '0', '0.2'],
      ['25', '8', '99.7', '0', '0.3'],
    ] as const
  ).forEach((row, r) => {
    row.forEach((c, i) => push(items, c, xs[i], 150 - r * 8, 'XS'))
  })
  return items
}

const side = clusterTextTables(buildSideBySide())
assert.ok(side.length >= 2, `expected 2 side-by-side tables, got ${side.length}`)
assert.ok(
  side.some((t) => t.rows.some((r) => r.includes('PIPE'))),
  'left materials table missing',
)
assert.ok(
  side.some((t) => t.headers.includes('0.000') || t.rows.flat().includes('700.1')),
  'right elevation table missing',
)
assert.ok(
  !side.some((t) => t.rows.some((r) => r.includes('PIPE') && r.includes('700.1'))),
  'tables should not be merged across the X gutter',
)

const mid = clusterTextTables(buildMidTitle())
assert.ok(mid.length >= 1, 'mid-title cross-section should still yield a table')
assert.ok(
  !mid.some((t) => t.headers.some((h) => /CROSS SECTION/i.test(h))),
  'title must not become a column header',
)
assert.ok(
  !mid.some((t) => t.rows.slice(1).some((r) => r.some((c) => /CROSS SECTION/i.test(c)))),
  'title must not appear as a data cell',
)
const xsTable = mid[0]
assert.ok(
  xsTable.headers.some((h) => /OFFSET|EL|CUT|FILL/i.test(h)) ||
    xsTable.rows.some((r) => r.includes('CHAIN')),
  'cross-section headers/labels should survive',
)

console.log('table-detect.test.ts: ok')
console.log(
  'index preview:',
  index.rows.map((r) => r.join(' | ')).join('\n'),
)
console.log(
  'side-by-side:',
  side.map((t) => `${t.rowCount}x${t.colCount} [${t.headers.slice(0, 4).join(',')}]`).join(' · '),
)
console.log(
  'mid-title headers:',
  xsTable.headers.join(' | '),
)
