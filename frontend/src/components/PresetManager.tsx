import { useState, useEffect, useCallback } from 'react'
import type { Preset } from '../api/types'
import { API_BASE } from '../api/config'
import { PlusIcon, TrashIcon, UpdateIcon } from './icons'
import { useI18n } from '../i18n'

interface PresetManagerProps {
  currentConfig: Record<string, any>
  onLoad: (config: Record<string, any>) => void
}

export default function PresetManager({ currentConfig, onLoad }: PresetManagerProps) {
  const { t } = useI18n()
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null)

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

  const handleUpdate = async (name: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config: currentConfig }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update preset')
      }
      await fetchPresets()
    } catch (err: any) {
      setError(err.message || 'Failed to update preset')
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
        <span className="preset-manager-title">{t('preset.savedPresets')}</span>
        <button
          type="button"
          className="btn btn-ghost preset-manager-save-btn"
          onClick={() => setShowSaveDialog(!showSaveDialog)}
        >
          <PlusIcon />
          {t('preset.saveCurrent')}
        </button>
      </div>

      {showSaveDialog && (
        <div className="preset-manager-save-dialog">
          <input
            type="text"
            className="input"
            placeholder={t('preset.namePlaceholder')}
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
            {saving ? t('preset.saving') : t('preset.save')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { setShowSaveDialog(false); setSaveName('') }}
          >
            {t('preset.cancel')}
          </button>
        </div>
      )}

      {error && <div className="preset-manager-error">{error}</div>}

      {loading && <div className="preset-manager-loading">{t('preset.loading')}</div>}

      {!loading && presets.length === 0 && (
        <div className="preset-manager-empty">{t('preset.noPresets')}</div>
      )}

      <div className="preset-manager-list">
        {presets.map((preset) => (
          <div key={preset.name} className="preset-manager-item">
            <button
              type="button"
              className="preset-manager-item-main"
              onClick={() => onLoad(preset.config)}
              title={t('preset.loadPreset')}
            >
              <span className="preset-manager-item-name">{preset.name}</span>
              <span className="preset-manager-item-detail">
                {Object.keys(preset.config).length} {t('preset.settings')}
              </span>
            </button>
            {confirmOverwrite === preset.name ? (
              <div className="preset-manager-confirm">
                <span>{t('preset.confirmOverwrite')}</span>
                <button
                  type="button"
                  className="btn btn-primary preset-manager-confirm-yes"
                  onClick={(e) => { e.stopPropagation(); handleUpdate(preset.name); setConfirmOverwrite(null) }}
                  disabled={saving}
                >
                  {saving ? '...' : t('preset.yes')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost preset-manager-confirm-no"
                  onClick={(e) => { e.stopPropagation(); setConfirmOverwrite(null) }}
                >
                  {t('preset.no')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="preset-manager-item-update"
                onClick={(e) => { e.stopPropagation(); setConfirmOverwrite(preset.name) }}
                disabled={saving}
                title={t('preset.overwrite')}
              >
                <UpdateIcon />
              </button>
            )}
            <button
              type="button"
              className="preset-manager-item-delete"
              onClick={(e) => { e.stopPropagation(); handleDelete(preset.name) }}
              disabled={deleting === preset.name}
              title={t('preset.delete')}
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
        .preset-manager-hint {
          padding: 6px 12px;
          background: var(--warning-soft, #fffbeb);
          color: var(--warning, #f59e0b);
          border-radius: var(--radius-sm);
          font-size: 11px;
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
        .preset-manager-item-update {
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
        .preset-manager-item:hover .preset-manager-item-update {
          opacity: 1;
        }
        .preset-manager-item-update:hover {
          color: var(--primary);
          background: var(--primary-glow);
        }
        .preset-manager-item-update:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .preset-manager-item-delete svg,
        .preset-manager-item-update svg {
          width: 14px;
          height: 14px;
        }
        .preset-manager-confirm {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 8px;
          border-left: 1px solid var(--hairline);
          font-size: 11px;
          color: var(--warning, #f59e0b);
          white-space: nowrap;
        }
        .preset-manager-confirm-yes,
        .preset-manager-confirm-no {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  )
}
