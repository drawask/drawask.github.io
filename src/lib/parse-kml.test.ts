import assert from 'node:assert/strict'
import { parseKmlText } from './parse-kml.ts'

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Sample</name>
    <Folder>
      <name>Sites</name>
      <Placemark>
        <name>Valve A</name>
        <description>Main valve</description>
        <Point><coordinates>55.27,25.20,12</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Pipe run</name>
        <LineString>
          <coordinates>
            55.27,25.20,0 55.28,25.21,0
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>
  </Document>
</kml>`

const parsed = parseKmlText(sample)
assert.equal(parsed.rows.length, 2)
assert.equal(parsed.rows[0].type, 'POINT')
assert.equal(parsed.rows[0].x, 55.27)
assert.equal(parsed.rows[0].y, 25.2)
assert.match(parsed.rows[0].text, /Valve A/)
assert.equal(parsed.rows[1].type, 'LINESTRING')
assert.ok(parsed.svg.includes('viewBox='))
assert.ok(parsed.svg.includes('cad-local'))
assert.equal(parsed.layers[0]?.name, 'Sample / Sites')

// Google Earth: xsi: without xmlns:xsi must not throw NamespaceError.
const earthish = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document xsi:schemaLocation="http://www.opengis.net/kml/2.2 http://schemas.opengis.net/kml/2.2.0/ogckml22.xsd">
    <Placemark><name>P</name><Point><coordinates>1,2,0</coordinates></Point></Placemark>
  </Document>
</kml>`
assert.equal(parseKmlText(earthish).rows.length, 1)

console.log('parse-kml.test.ts: ok')
