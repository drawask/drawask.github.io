import { useMemo, useRef, useState } from 'react'
import './App.css'
import { DrawingPlayground } from './components/DrawingPlayground'
import { ExportForAi } from './components/ExportForAi'
import { parseCadFile } from './lib/parse-cad'
import type { ExportScope, ParseResult, RegionBox } from './lib/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Tab = 'view' | 'export'

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [tab, setTab] = useState<Tab>('view')
  const [playgroundOpen, setPlaygroundOpen] = useState(false)
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([])
  const [region, setRegion] = useState<RegionBox | null>(null)

  const scope: ExportScope = useMemo(
    () => ({ hiddenLayers, region }),
    [hiddenLayers, region],
  )

  async function handleFile(file: File | undefined) {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.dwg') && !lower.endsWith('.dxf')) {
      setError('Please upload a .dwg or .dxf file.')
      return
    }

    setBusy(true)
    setError(null)
    setStatus(`Parsing ${file.name}…`)
    setResult(null)

    try {
      const parsed = await parseCadFile(file)
      setResult(parsed)
      setHiddenLayers([])
      setRegion(null)
      setPlaygroundOpen(false)
      setTab('view')
      setStatus(
        `Ready: ${parsed.entityCount} entities, ${parsed.layerCount} layers from ${file.name}`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse CAD file.'
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          CadChat
        </div>
        <h1>Free online DWG viewer. Open drawings, export CSV, chat with AI.</h1>
        <p>
          Open AutoCAD <strong>DWG</strong> or <strong>DXF</strong> in your browser, explore
          layers, extract elevation and index tables to CSV, then copy a clean pack for
          ChatGPT, Claude, or Cursor. Parsing stays on your device.
        </p>
        <ul className="seo-pills" aria-label="Popular uses">
          <li>
            <a href="/dwg-to-csv.html">DWG to CSV</a>
          </li>
          <li>
            <a href="/open-dwg-online.html">Open DWG online</a>
          </li>
          <li>
            <a href="/dwg-to-chatgpt.html">DWG to ChatGPT</a>
          </li>
          <li>
            <a href="/extract-table-from-dwg.html">Extract table from DWG</a>
          </li>
        </ul>
      </header>

      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragActive(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          void handleFile(e.dataTransfer.files?.[0])
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dwg,.dxf,application/acad,application/x-dwg,image/vnd.dwg"
          disabled={busy}
          className="file-input"
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn primary browse-btn"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? 'Parsing…' : 'Browse files'}
        </button>
        <h2>{busy ? 'Parsing drawing…' : 'Drop a .dwg or .dxf file here'}</h2>
        <p>Free DWG viewer online. One file powers View and Ask AI. Nothing is uploaded to a server.</p>
      </div>

      {error ? <p className="status error">{error}</p> : null}
      {status ? <p className={`status ${error ? '' : 'ok'}`}>{status}</p> : null}

      {result ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">File</div>
              <div className="value" style={{ fontSize: '1rem' }}>
                {result.fileName}
              </div>
            </div>
            <div className="stat">
              <div className="label">Size</div>
              <div className="value">{formatBytes(result.fileSizeBytes)}</div>
            </div>
            <div className="stat">
              <div className="label">Entities</div>
              <div className="value">{result.entityCount}</div>
            </div>
            <div className="stat">
              <div className="label">Layers</div>
              <div className="value">{result.layerCount}</div>
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Workspace mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'view'}
              className={`tab ${tab === 'view' ? 'active' : ''}`}
              onClick={() => setTab('view')}
            >
              View
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'export'}
              className={`tab ${tab === 'export' ? 'active' : ''}`}
              onClick={() => setTab('export')}
            >
              Ask AI
            </button>
          </div>

          {tab === 'view' ? (
            <>
              <section className="panel playground-card">
                <div className="panel-header">
                  <h3>Playground</h3>
                  <span className="mono">
                    {result.svg
                      ? 'Zoom · pan · layers · region select'
                      : result.format === 'dxf'
                        ? 'DXF data ready · SVG preview not available yet'
                        : 'Preview unavailable'}
                  </span>
                </div>
                <div className="panel-body playground-card-body">
                  <div>
                    <p>
                      Open the full-screen playground to inspect the drawing, toggle layers,
                      preview text on a layer, and optionally box a region for the AI pack.
                    </p>
                    <div className="toolbar" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="btn primary browse-btn"
                        disabled={!result.svg}
                        onClick={() => setPlaygroundOpen(true)}
                      >
                        Enter playground
                      </button>
                      <button
                        type="button"
                        className="btn accent"
                        onClick={() => setTab('export')}
                      >
                        Go to Ask AI
                      </button>
                    </div>
                  </div>
                  <div className="playground-card-note mono">
                    hidden layers: {hiddenLayers.length}
                    <br />
                    region: {region ? 'selected' : 'full drawing'}
                    <br />
                    tables found: {result.tables.length}
                  </div>
                </div>
              </section>

              <section className="panel" style={{ marginTop: 16 }}>
                <div className="panel-header">
                  <h3>Quick layer map</h3>
                  <span className="mono">content layers flagged for AI</span>
                </div>
                <div className="panel-body">
                  <div className="chips">
                    {result.layers
                      .filter((l) => l.likelyAnswer)
                      .slice(0, 24)
                      .map((layer) => (
                        <span key={layer.name} className="chip">
                          {layer.name} · {layer.textCount}t
                        </span>
                      ))}
                  </div>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {Object.entries(result.entityTypeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <span key={type} className="chip">
                          {type} {count}
                        </span>
                      ))}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <ExportForAi
              result={result}
              scope={scope}
              onStatus={setStatus}
            />
          )}

          {playgroundOpen && result.svg ? (
            <DrawingPlayground
              result={result}
              hiddenLayers={hiddenLayers}
              region={region}
              onHiddenLayersChange={setHiddenLayers}
              onRegionChange={setRegion}
              onClose={() => setPlaygroundOpen(false)}
            />
          ) : null}
        </>
      ) : null}

      <section className="panel guides-panel" aria-labelledby="guides-heading">
        <div className="panel-header">
          <h2 id="guides-heading">Guides</h2>
        </div>
        <div className="panel-body">
          <div className="guide-grid">
            <a className="guide-card" href="/dwg-to-csv.html">
              <strong>DWG to CSV</strong>
              <span>Extract CAD tables and download CSV online.</span>
            </a>
            <a className="guide-card" href="/dwg-to-chatgpt.html">
              <strong>DWG to ChatGPT</strong>
              <span>Copy a clean pack and chat about the drawing.</span>
            </a>
            <a className="guide-card" href="/open-dwg-online.html">
              <strong>Open DWG online</strong>
              <span>Free browser DWG/DXF viewer, no install.</span>
            </a>
            <a className="guide-card" href="/extract-table-from-dwg.html">
              <strong>Extract table from DWG</strong>
              <span>Pull elevation and index tables from sheets.</span>
            </a>
          </div>
        </div>
      </section>

      <section className="faq panel" aria-labelledby="faq-heading">
        <div className="panel-header">
          <h2 id="faq-heading">FAQ</h2>
        </div>
        <div className="panel-body faq-body">
          <details open>
            <summary>Is my DWG uploaded to a server?</summary>
            <p>
              No. CadChat parses the file locally in your browser with WebAssembly. The drawing
              does not leave your machine through this app.
            </p>
          </details>
          <details>
            <summary>Can I convert DWG to CSV?</summary>
            <p>
              Yes. After opening a drawing, use Ask AI to download scoped CSV or copy a Markdown
              pack that includes detected tables (stations, elevations, drawing index, and more).
            </p>
          </details>
          <details>
            <summary>Does this work with ChatGPT or Claude?</summary>
            <p>
              Yes. Click Copy for chat, paste into ChatGPT, Claude, or Cursor, and ask takeoff or
              review questions about the drawing.
            </p>
          </details>
          <details>
            <summary>DWG vs DXF?</summary>
            <p>
              Both are supported. DWG includes an interactive SVG playground. DXF currently focuses
              on data extract (tables/text) without full visual preview.
            </p>
          </details>
          <details>
            <summary>Is CadChat free?</summary>
            <p>Yes. The tool is free to use in the browser.</p>
          </details>
        </div>
      </section>

      <footer className="site-footer">
        <p>
          CadChat on{' '}
          <a href="https://drawask.github.io/">drawask.github.io</a>
          {' · '}
          <a href="https://github.com/drawask/drawask.github.io">Source</a>
          {' · '}
          Free online DWG / DXF viewer
        </p>
      </footer>
    </div>
  )
}
