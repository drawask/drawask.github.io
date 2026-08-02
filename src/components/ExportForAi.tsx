import { useMemo, useState } from 'react'
import { buildAiReport, buildExportJson, type ReportMode } from '../lib/ai-report'
import { copyText, downloadText } from '../lib/download'
import { describeScope, filterRowsByScope } from '../lib/scope'
import { tableToCsv } from '../lib/table-detect'
import { rowsToCsv } from '../lib/to-csv'
import type { ExportScope, ParseResult } from '../lib/types'

type Props = {
  result: ParseResult
  scope: ExportScope
  onStatus: (message: string) => void
}

function baseName(fileName: string): string {
  return fileName.replace(/\.(dwg|dxf)$/i, '')
}

export function ExportForAi({ result, scope, onStatus }: Props) {
  const [mode, setMode] = useState<ReportMode>('summary')
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState(false)

  const scopedCount = useMemo(
    () => filterRowsByScope(result.rows, scope).length,
    [result.rows, scope],
  )

  const report = useMemo(
    () =>
      buildAiReport(result, {
        scope,
        mode,
        userQuestion: question,
      }),
    [result, scope, mode, question],
  )

  async function copyForAi() {
    try {
      await copyText(report)
      setCopied(true)
      onStatus('Copied. Paste into your AI chat and ask away.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      onStatus('Clipboard copy was blocked. Use Download Markdown instead.')
    }
  }

  function downloadMarkdown() {
    downloadText(
      `${baseName(result.fileName)}-ai-${mode}.md`,
      report,
      'text/markdown;charset=utf-8',
    )
    onStatus('Markdown report downloaded.')
  }

  function downloadCsv() {
    const rows = filterRowsByScope(result.rows, scope)
    downloadText(
      `${baseName(result.fileName)}-scoped.csv`,
      rowsToCsv(rows),
      'text/csv;charset=utf-8',
    )
    onStatus(`Scoped CSV downloaded (${rows.length} rows).`)
  }

  function downloadJson() {
    downloadText(
      `${baseName(result.fileName)}-scoped.json`,
      JSON.stringify(buildExportJson(result, scope), null, 2),
      'application/json;charset=utf-8',
    )
    onStatus('Scoped JSON downloaded.')
  }

  const likely = result.layers.filter((l) => l.likelyAnswer).slice(0, 12)

  return (
    <div className="export-panel">
      <div className="panel">
        <div className="panel-header">
          <h3>Ask AI</h3>
          <span className="mono">
            {scopedCount}/{result.entityCount} entities · {describeScope(scope, result.layerCount)}
          </span>
        </div>
        <div className="panel-body">
          <p className="export-lead">
            Copy a clean pack from the same file as the playground, then paste it into ChatGPT,
            Claude, or Cursor and keep chatting. Hidden layers and any selected region are
            applied automatically.
          </p>

          <div className="export-controls">
            <label className="export-field">
              <span>Detail level</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ReportMode)}
              >
                <option value="summary">Summary (fits most chats)</option>
                <option value="detailed">Detailed (more text/positions)</option>
              </select>
            </label>
          </div>

          <label className="export-field">
            <span>Optional question (prepended to the extract)</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="e.g. Estimate HDPE pipe quantities and list station/elevation table values."
            />
          </label>

          <div className="toolbar">
            <button type="button" className="btn accent" onClick={() => void copyForAi()}>
              {copied ? 'Copied' : 'Copy for chat'}
            </button>
            <button type="button" className="btn primary" onClick={downloadMarkdown}>
              Download Markdown
            </button>
            <button type="button" className="btn" onClick={downloadCsv}>
              Download CSV
            </button>
            <button type="button" className="btn" onClick={downloadJson}>
              Download JSON
            </button>
          </div>

          <div className="export-likely">
            <h4>Layers likely to contain answers</h4>
            <div className="chips">
              {likely.length === 0 ? (
                <span className="chip">No auto-flagged content layers</span>
              ) : (
                likely.map((layer) => (
                  <span key={layer.name} className="chip">
                    {layer.name} · {layer.textCount} texts
                  </span>
                ))
              )}
            </div>
          </div>

          {result.tables.length > 0 ? (
            <div className="export-tables">
              <h4>Detected labeled tables</h4>
              <ul>
                {result.tables.slice(0, 5).map((table, idx) => (
                  <li key={`${table.layer}-${table.rowCount}-${idx}`}>
                    <code>{table.layer}</code> — {table.rowCount} rows ×{' '}
                    {Math.max(table.colCount - 1, 0)} cols
                    {table.headers[1] ? ` · headers ${table.headers[1]}…` : ''}
                    {' '}
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '4px 10px', marginLeft: 8 }}
                      onClick={() => {
                        downloadText(
                          `${baseName(result.fileName)}-table-${idx + 1}.csv`,
                          tableToCsv(table),
                          'text/csv;charset=utf-8',
                        )
                        onStatus(`Table ${idx + 1} CSV downloaded.`)
                      }}
                    >
                      Download table CSV
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ai-box export-preview">
            <h3>Preview of what will be copied</h3>
            <pre className="mono">{report.slice(0, 5000)}</pre>
            {report.length > 5000 ? (
              <p className="status">Preview truncated. Full text is used for Copy/Download.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
