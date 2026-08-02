import type { EntityRow } from './types'

const COLUMNS: Array<keyof EntityRow> = [
  'handle',
  'type',
  'layer',
  'colorIndex',
  'color',
  'lineType',
  'visible',
  'text',
  'blockName',
  'attributes',
  'x',
  'y',
  'x2',
  'y2',
  'geometry',
  'details',
]

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function rowsToCsv(rows: EntityRow[]): string {
  const header = COLUMNS.join(',')
  const lines = rows.map((row) =>
    COLUMNS.map((col) => {
      const value = row[col]
      return escapeCsv(value == null ? '' : String(value))
    }).join(','),
  )
  return [header, ...lines].join('\n')
}
