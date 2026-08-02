import assert from 'node:assert/strict'
import { extractDescriptionFields, parseKmlText } from './parse-kml.ts'

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Sample</name>
    <Folder>
      <name>Sites</name>
      <Placemark>
        <name>Valve A</name>
        <description><![CDATA[
          <table>
            <tr><td>DIAMETER</td><td>250</td></tr>
            <tr><td>ZONE</td><td>ZONE 1</td></tr>
          </table>
        ]]></description>
        <Point><coordinates>55.27,25.20,12</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Pipe run</name>
        <description><![CDATA[
          <table>
            <tr><td>DIAMETER</td><td>600</td></tr>
            <tr><td>ZONE</td><td>ZONE 2</td></tr>
          </table>
        ]]></description>
        <LineString>
          <coordinates>
            55.27,25.20,0 55.28,25.21,0
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>
  </Document>
</kml>`

const fields = extractDescriptionFields(
  '<tr><td>DIAMETER</td><td>400</td></tr><tr><td>ZONE</td><td>ZONE 9</td></tr>',
)
assert.equal(fields.DIAMETER, '400')
assert.equal(fields.ZONE, 'ZONE 9')

const parsed = parseKmlText(sample)
assert.equal(parsed.rows.length, 2)
assert.equal(parsed.rows[0].layer, 'PO-Ø250 HDPE')
assert.equal(parsed.rows[0].color, 'rgb(34,197,94)')
assert.match(parsed.rows[0].text, /PO-Ø250/)
assert.equal(parsed.rows[1].layer, 'PO-Ø600 HDPE')
assert.equal(parsed.rows[1].color, 'rgb(239,68,68)')
assert.ok(parsed.svg.includes('rgb(239,68,68)'))
assert.ok(parsed.svg.includes('cad-local'))

// Google Earth: xsi: without xmlns:xsi must not throw NamespaceError.
const earthish = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document xsi:schemaLocation="http://www.opengis.net/kml/2.2 http://schemas.opengis.net/kml/2.2.0/ogckml22.xsd">
    <Placemark><name>P</name><Point><coordinates>1,2,0</coordinates></Point></Placemark>
  </Document>
</kml>`
assert.equal(parseKmlText(earthish).rows.length, 1)

console.log('parse-kml.test.ts: ok')
