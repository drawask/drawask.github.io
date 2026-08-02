import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/@mlightcad/libredwg-web/wasm')
const dest = join(root, 'public/wasm')

mkdirSync(dest, { recursive: true })
for (const file of ['libredwg-web.wasm', 'libredwg-web.js', 'libredwg-web.d.ts']) {
  copyFileSync(join(src, file), join(dest, file))
}
console.log('Copied LibreDWG wasm assets to public/wasm')
