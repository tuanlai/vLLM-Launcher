import { useState, useEffect, useCallback } from 'react'

export interface Preset {
  name: string
  config: Record<string, any>
  created_at: string
}

interface PresetManagerProps {
  currentConfig: Record<string, any>
  onLoad: (config: Record<string, any>) => void
}

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8001`
  : ''

export default function PresetManager({ currentConfig, onLoad }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchPresets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/presets`)
      if (!res.ok) throw new Error('Failed to load presets')
      const data = await res.json()
      setPresets(data.presets || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load presets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPresets()
  }, [fetchPresets])

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), config: currentConfig }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to save preset')
      }
      setSaveName('')
      setShowSaveDialog(false)
      await fetchPresets()
    } catch (err: any) {
      setError(err.message || 'Failed to save preset')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    setDeleting(name)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/presets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete preset')
      await fetchPresets()
    } catch (err: any) {
      setError(err.message || 'Failed to delete preset')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="preset-manager">
      <div className="preset-manager-header">
        <span className="preset-manager-title">Saved Presets</span>
        <button
          type="button"
          className="btn btn-ghost preset-manager-save-btn"
          onClick={() => setShowSaveDialog(!showSaveDialog)}
        >
          <PlusIcon />
          Save current
        </button>
      </div>

      {showSaveDialog && (
        <div className="preset-manager-save-dialog">
          <input
            type="text"
            className="input"
            placeholder="Preset name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { setShowSaveDialog(false); setSaveName('') }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && <div className="preset-manager-error">{error}</div>}

      {loading && <div className="preset-manager-loading">Loading presets...</div>}

      {!loading && presets.length === 0 && (
        <div className="preset-manager-empty">No saved presets yet</div>
      )}

      <div className="preset-manager-list">
        {presets.map((preset) => (
          <div key={preset.name} className="preset-manager-item">
            <button
              type="button"
              className="preset-manager-item-main"
              onClick={() => onLoad(preset.config)}
              title="Load this preset"
            >
              <span className="preset-manager-item-name">{preset.name}</span>
              <span className="preset-manager-item-detail">
                {Object.keys(preset.config).length} settings
              </span>
            </button>
            <button
              type="button"
              className="preset-manager-item-delete"
              onClick={(e) => { e.stopPropagation(); handleDelete(preset.name) }}
              disabled={deleting === preset.name}
              title="Delete preset"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        .preset-manager {
          margin-top: 8px;
        }
        .preset-manager-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .preset-manager-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .preset-manager-save-btn {
          font-size: 12px;
          padding: 4px 10px;
        }
        .preset-manager-save-btn svg {
          width: 14px;
          height: 14px;
        }
        .preset-manager-save-dialog {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          align-items: center;
        }
        .preset-manager-save-dialog .input {
          flex: 1;
        }
        .preset-manager-save-dialog .btn {
          flex-shrink: 0;
        }
        .preset-manager-error {
          padding: 8px 12px;
          background: var(--error-soft);
          color: var(--error);
          border-radius: var(--radius-sm);
          font-size: 12px;
          margin-bottom: 8px;
        }
        .preset-manager-loading, .preset-manager-empty {
          padding: 16px;
          text-align: center;
          font-size: 13px;
          color: var(--mute);
        }
        .preset-manager-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preset-manager-item {
          display: flex;
          align-items: stretch;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .preset-manager-item:hover {
          border-color: var(--hairline-soft);
        }
        .preset-manager-item-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: var(--font-sans);
          transition: background 0.1s;
          gap: 8px;
        }
        .preset-manager-item-main:hover {
          background: var(--surface-hover);
        }
        .preset-manager-item-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
        }
        .preset-manager-item-detail {
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--mute);
        }
        .preset-manager-item-delete {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          background: none;
          border: none;
          border-left: 1px solid var(--hairline);
          cursor: pointer;
          color: var(--mute);
          transition: color 0.15s, background 0.15s;
          opacity: 0;
        }
        .preset-manager-item:hover .preset-manager-item-delete {
          opacity: 1;
        }
        .preset-manager-item-delete:hover {
          color: var(--error);
          background: var(--error-soft);
        }
        .preset-manager-item-delete:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .preset-manager-item-delete svg {
          width: 14px;
          height: 14px;
        }
      `}</style>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}
