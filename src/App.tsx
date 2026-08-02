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
        <h1>See the drawing. Chat about it with AI.</h1>
        <p>
          Upload DWG or DXF, explore layers in the playground, then copy a clean pack for
          ChatGPT, Claude, or any other model — takeoffs, cost checks, design QA, and more.
        </p>
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
        <p>Parsing runs locally in your browser. One file powers both View and Export.</p>
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
    </div>
  )
}
