import { useState, useEffect, useRef, useMemo } from 'react'

export interface ModelInfo {
  name: string
  path: string
  size_gb: number
  format: string
  param_count: string | null
}

export interface VRAMCheckResult {
  total_vram_gb: number
  used_vram_gb: number
  free_vram_gb: number
  model_estimated_gb: number
  feasible: boolean
  message: string
}

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
  onVRAMCheck?: (result: VRAMCheckResult) => void
}

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8001`
  : ''

export default function ModelSelector({ value, onChange, onVRAMCheck }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [vramLoading, setVramLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scanModels = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/models/scan?path=/home/tuanlai/Models`)
      if (!res.ok) throw new Error('Failed to scan models')
      const data = await res.json()
      setModels(data.models || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    scanModels()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Group models by parent directory
  const groupedModels = useMemo(() => {
    const filtered = models.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.path.toLowerCase().includes(search.toLowerCase())
    )
    const groups: Record<string, ModelInfo[]> = {}
    for (const m of filtered) {
      const parts = m.path.split('/')
      const parent = parts.length > 1 ? parts[parts.length - 2] : '/'
      if (!groups[parent]) groups[parent] = []
      groups[parent].push(m)
    }
    return groups
  }, [models, search])

  const handleSelect = async (model: ModelInfo) => {
    onChange(model.path)
    setSearch(model.name)
    setOpen(false)
    setManualMode(false)

    // Run VRAM check
    if (onVRAMCheck) {
      setVramLoading(true)
      try {
        const params = new URLSearchParams({
          model_path: model.path,
          dtype: 'float16',
          quantization: 'none',
          tensor_parallel_size: '1',
        })
        const res = await fetch(`${API_BASE}/api/models/vram-check?${params}`)
        if (res.ok) {
          const data = await res.json()
          onVRAMCheck(data)
        }
      } catch {
        // silently ignore VRAM check failures
      } finally {
        setVramLoading(false)
      }
    }
  }

  const handleManualSubmit = () => {
    if (value.trim()) {
      setOpen(false)
    }
  }

  const formatBadge = (format: string) => {
    const cls = format.toUpperCase() === 'GGUF' ? 'badge-warning' : 'badge-info'
    return <span className={`badge ${cls}`}>{format.toUpperCase()}</span>
  }

  return (
    <div className="model-selector" ref={containerRef}>
      <label className="input-label">Model</label>
      <div className="model-selector-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="input model-selector-input"
          placeholder="Search models or type a custom path..."
          value={manualMode ? value : search}
          onChange={(e) => {
            if (manualMode) {
              onChange(e.target.value)
            } else {
              setSearch(e.target.value)
              setOpen(true)
            }
          }}
          onFocus={() => { if (!manualMode) setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manualMode) handleManualSubmit()
          }}
        />
        <button
          type="button"
          className="btn btn-ghost model-selector-refresh"
          onClick={(e) => { e.stopPropagation(); scanModels() }}
          title="Refresh model list"
          disabled={loading}
        >
          <RefreshIcon spinning={loading} />
        </button>
      </div>

      {open && !manualMode && (
        <div className="model-selector-dropdown">
          {error && <div className="model-selector-error">{error}</div>}

          {Object.keys(groupedModels).length === 0 && !loading && !error && (
            <div className="model-selector-empty">No models found</div>
          )}

          {Object.entries(groupedModels).map(([group, items]) => (
            <div key={group} className="model-selector-group">
              <div className="model-selector-group-label">{group}</div>
              {items.map((model) => (
                <button
                  key={model.path}
                  type="button"
                  className="model-selector-item"
                  onClick={() => handleSelect(model)}
                >
                  <span className="model-selector-item-name">{model.name}</span>
                  <span className="model-selector-item-meta">
                    {formatBadge(model.format)}
                    <span className="model-selector-item-size">{model.size_gb.toFixed(1)} GB</span>
                    {model.param_count && (
                      <span className="model-selector-item-params">{model.param_count}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}

          <button
            type="button"
            className="model-selector-item model-selector-manual"
            onClick={() => {
              setManualMode(true)
              setOpen(false)
              setSearch('')
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
          >
            <span className="model-selector-item-name">Enter custom model path...</span>
          </button>
        </div>
      )}

      {vramLoading && (
        <div className="model-selector-vram-loading">Checking VRAM requirements...</div>
      )}

      <style>{`
        .model-selector {
          position: relative;
        }
        .model-selector-input-wrap {
          display: flex;
          gap: 6px;
          align-items: stretch;
        }
        .model-selector-input {
          flex: 1;
        }
        .model-selector-refresh {
          flex-shrink: 0;
          padding: 6px 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .model-selector-refresh svg {
          width: 16px;
          height: 16px;
        }
        .model-selector-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          max-height: 320px;
          overflow-y: auto;
          z-index: 100;
        }
        .model-selector-group {
          padding: 4px 0;
        }
        .model-selector-group:not(:last-child) {
          border-bottom: 1px solid var(--hairline);
        }
        .model-selector-group-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 12px 4px;
        }
        .model-selector-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--ink);
          transition: background 0.1s;
          gap: 8px;
        }
        .model-selector-item:hover {
          background: var(--surface-hover);
        }
        .model-selector-item-name {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          min-width: 0;
        }
        .model-selector-item-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .model-selector-item-size {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--mute);
        }
        .model-selector-item-params {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--mute);
          background: var(--canvas-softer);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
        }
        .model-selector-manual {
          border-top: 1px solid var(--hairline);
          color: var(--primary);
        }
        .model-selector-manual .model-selector-item-name {
          font-weight: 500;
          font-style: italic;
        }
        .model-selector-empty, .model-selector-error {
          padding: 16px 12px;
          text-align: center;
          font-size: 13px;
          color: var(--mute);
        }
        .model-selector-error {
          color: var(--error);
        }
        .model-selector-vram-loading {
          margin-top: 6px;
          font-size: 12px;
          color: var(--mute);
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .model-selector-refresh .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? 'spin' : ''}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}
