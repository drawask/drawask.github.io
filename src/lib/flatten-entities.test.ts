import assert from 'node:assert/strict'
import { normalizeCadText } from './flatten-entities.ts'

assert.equal(normalizeCadText('GL:700.948'), 'GL:700.948')
assert.equal(
  normalizeCadText('E:546618.426\\PN:2772761.006'),
  'E:546618.426\nN:2772761.006',
)
assert.equal(normalizeCadText('{\\C5;}'), '')
assert.equal(normalizeCadText('0+750'), '0+750')
assert.equal(normalizeCadText('PO-%%C250'), 'PO-Ø250')
assert.equal(normalizeCadText('PO-%C400'), 'PO-Ø400')

console.log('flatten-entities.test.ts: ok')
