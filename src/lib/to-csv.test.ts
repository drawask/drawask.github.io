import assert from 'node:assert/strict'
import { rowsToCsv } from './to-csv.ts'
import type { EntityRow } from './types.ts'

const row: EntityRow = {
  handle: '1A',
  type: 'TEXT',
  layer: 'NOTES',
  colorIndex: '7',
  color: '',
  lineType: 'BYLAYER',
  visible: 'true',
  text: 'Door, "A"',
  blockName: '',
  attributes: '',
  geometry: 'start=0,0; height=2.5',
  details: '{"rotation":0}',
  x: 10,
  y: 20,
  x2: null,
  y2: null,
}

const csv = rowsToCsv([row])
assert.ok(csv.startsWith('handle,type,layer,'))
assert.ok(csv.includes('"Door, ""A"""'))
assert.ok(csv.includes('NOTES'))
assert.ok(csv.includes(',10,20,'))
console.log('to-csv.test.ts: ok')
